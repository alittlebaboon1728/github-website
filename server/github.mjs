const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 180;
const cache = new Map();
const inFlight = new Map();
const identifier = /^[a-zA-Z0-9_.-]{1,100}$/;

export class GitHubError extends Error {
  constructor(message, status = 502, resetAt = null) {
    super(message);
    this.status = status;
    this.resetAt = resetAt;
  }
}

export function buildGitHubPath(url) {
  const path = url.pathname.replace(/^\/api\/github/, "");
  if (path === "/search") {
    const q = (
      url.searchParams.get("q") || "stars:>1000 archived:false"
    ).trim();
    const page = Number(url.searchParams.get("page") || "1");
    const sort = url.searchParams.get("sort") || "stars";
    if (q.length > 500 || !q)
      throw new GitHubError("搜索内容需要在 1 到 500 个字符之间。", 400);
    if (!Number.isInteger(page) || page < 1 || page > 84)
      throw new GitHubError("页码超出了 GitHub 搜索范围。", 400);
    if (!["stars", "updated", "best-match"].includes(sort))
      throw new GitHubError("不支持的排序方式。", 400);
    const parameters = new URLSearchParams({
      q: /(?:^|\s)is:public(?:\s|$)/.test(q) ? q : `${q} is:public`,
      page: String(page),
      per_page: "12",
      order: "desc",
    });
    if (sort !== "best-match") parameters.set("sort", sort);
    return `/search/repositories?${parameters}`;
  }
  const match = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/readme)?$/);
  if (
    match &&
    identifier.test(match[1]) &&
    identifier.test(match[2]) &&
    ![".", ".."].includes(match[1]) &&
    ![".", ".."].includes(match[2])
  ) {
    return `/repos/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}${match[3] || ""}`;
  }
  throw new GitHubError("没有找到这个数据接口。", 404);
}

export async function getGitHubData(
  path,
  { token, fetchImpl = fetch, cacheState, clock = Date.now } = {},
) {
  const entries = cacheState?.cache || cache;
  const pending = cacheState?.inFlight || inFlight;
  const now = clock();
  const saved = entries.get(path);
  if (saved && now - saved.savedAt < CACHE_TTL)
    return { ...saved.result, source: "cache" };
  if (pending.has(path)) return pending.get(path);
  const request = (async () => {
    if (path.endsWith("/readme"))
      await getGitHubData(path.slice(0, -7), {
        token,
        fetchImpl,
        cacheState,
        clock,
      });
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "Open-Source-Observatory",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (saved?.etag) headers["If-None-Match"] = saved.etag;
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        headers,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      throw new GitHubError("暂时无法连接 GitHub，请稍后重试。", 502);
    }
    if (response.status === 304 && saved) {
      saved.savedAt = now;
      return { ...saved.result, source: "cache" };
    }
    if (!response.ok) {
      const reset = response.headers.get("x-ratelimit-reset");
      const retryAfter = response.headers.get("retry-after");
      const retryTime = retryAfter
        ? /^\d+(?:\.\d+)?$/.test(retryAfter)
          ? clock() + Number(retryAfter) * 1000
          : Date.parse(retryAfter)
        : reset
          ? Number(reset) * 1000
          : NaN;
      const resetAt = Number.isFinite(retryTime)
        ? new Date(Math.min(retryTime, clock() + 86400_000)).toISOString()
        : null;
      if ([403, 429].includes(response.status))
        throw new GitHubError(
          "GitHub 暂时限制了请求频率，请稍后再试。",
          429,
          resetAt,
        );
      if (response.status === 404)
        throw new GitHubError(
          path.endsWith("/readme")
            ? "这个仓库还没有公开 README。"
            : "这个公开仓库不存在，或已改名、转为私有。",
          404,
        );
      if (response.status === 422)
        throw new GitHubError(
          "GitHub 无法处理这个搜索条件，请调整关键词或筛选。",
          422,
        );
      throw new GitHubError("GitHub 数据暂时不可用，请稍后重试。", 502);
    }
    const data = await response.json();
    if (data.private === true) throw new GitHubError("只能查看公开仓库。", 404);
    if (path.endsWith("/readme")) {
      if (data.encoding !== "base64" || typeof data.content !== "string")
        throw new GitHubError(
          "这个 README 无法直接预览，请前往 GitHub 阅读。",
          422,
        );
      const content = Buffer.from(data.content, "base64").toString("utf8");
      const limit = 180000;
      data.content = content.slice(0, limit);
      data.truncated = content.length > limit;
      data.encoding = "utf-8";
    }
    const result = {
      data,
      source: "live",
      fetchedAt: new Date(clock()).toISOString(),
      rateRemaining: response.headers.get("x-ratelimit-remaining"),
    };
    if (entries.size >= MAX_CACHE_ENTRIES)
      entries.delete(entries.keys().next().value);
    entries.set(path, {
      result,
      savedAt: now,
      etag: response.headers.get("etag"),
    });
    return result;
  })();
  pending.set(path, request);
  try {
    return await request;
  } finally {
    pending.delete(path);
  }
}

export async function handleGitHubRequest(req, res, options = {}) {
  if (!req.url?.startsWith("/api/github/")) return false;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    res.end(JSON.stringify({ error: "这个接口只接受读取请求。" }));
    return true;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    const path = buildGitHubPath(url);
    let result = await (options.library?.enabled && url.pathname === "/api/github/search"
      ? options.library.search(Object.fromEntries(url.searchParams))
      : options.github
      ? options.github(path)
      : getGitHubData(path, options));
    if (options.media && !(options.library?.enabled && url.pathname === "/api/github/search")) {
      if (Array.isArray(result.data.items)) result = { ...result, data: { ...result.data, items: await options.media.decorate(result.data.items) } };
      else if (result.data.full_name) result = { ...result, data: (await options.media.decorate([result.data]))[0] };
    }
    res.writeHead(200);
    res.end(JSON.stringify(result));
  } catch (error) {
    const known = error instanceof GitHubError;
    res.writeHead(known ? error.status : 500);
    res.end(
      JSON.stringify({
        error: known ? error.message : "数据服务暂时不可用。",
        resetAt: known ? error.resetAt : null,
      }),
    );
  }
  return true;
}
