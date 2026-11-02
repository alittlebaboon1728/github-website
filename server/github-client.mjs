import { getGitHubData, GitHubError } from "./github.mjs";
import { boundedText } from "./storage.mjs";
import { createTaskQueue } from "./task-queue.mjs";
import {
  parsePublicRepository,
  parseRepositorySearch,
  readmeFromHtml,
  validRepository,
} from "./github-public.mjs";

const MINUTE = 60_000;
const STALE_TTL = 7 * 86400_000;
const recoverable = (error) => [429, 500, 502, 503, 504].includes(error.status);
const webNotice =
  "资料来自 GitHub 公开网页；网页未提供的派生数、推送时间等字段暂不展示。";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function retryTime(headers, now = Date.now()) {
  const retry = headers.get("retry-after");
  const parsed =
    retry &&
    (/^\d+(?:\.\d+)?$/.test(retry)
      ? now + Number(retry) * 1000
      : Date.parse(retry));
  const reset = Number(headers.get("x-ratelimit-reset")) * 1000;
  return Math.min(
    now + 86400_000,
    Math.max(now + MINUTE, parsed || reset || 0),
  );
}

/** Shared by search, cards, recommendations, rankings and the public proxy. */
export function createGitHubClient({
  token,
  store,
  fetchImpl = fetch,
  now = Date.now,
  wait = delay,
  searchInterval = token ? 2100 : 6100,
  webInterval = 1000,
  fastSearchFallback = true,
} = {}) {
  const cache = new Map(),
    pending = new Map(),
    pages = new Map(),
    pagePending = new Map();
  const cacheState = { cache: new Map(), inFlight: new Map() };
  const lanes = Object.fromEntries(
    ["search", "core", "web", "raw"].map((name) => [
      name,
      {
        queue: Promise.resolve(),
        count: 0,
        next: 0,
        until: 0,
        work: createTaskQueue(name === "raw" ? 4 : name === "core" ? 2 : 1),
      },
    ]),
  );
  let initialized;
  const init = () =>
    (initialized ||= (async () => {
      const saved = await store
        ?.read("github-response-cache")
        .catch(() => null);
      for (const [key, entry] of Object.entries(saved || {}))
        if (entry?.result?.data && now() - entry.savedAt < STALE_TTL)
          cache.set(key, entry);
      const limits = await store?.read("github-cooldowns").catch(() => null);
      for (const name of Object.keys(lanes))
        if (
          Number.isFinite(limits?.[name]) &&
          limits[name] > now() &&
          limits[name] <= now() + 86400_000
        )
          lanes[name].until = limits[name];
    })());
  async function remember(key, result) {
    const entry = { savedAt: now(), result };
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    await store
      ?.update("github-response-cache", (previous) => {
        const values = { ...previous, [key]: entry };
        const sorted = Object.entries(values)
          .filter(([, v]) => now() - v.savedAt < STALE_TTL)
          .sort((a, b) => b[1].savedAt - a[1].savedAt);
        let bytes = 0;
        return Object.fromEntries(
          sorted.slice(0, 120).filter(([, value]) => {
            bytes += Buffer.byteLength(JSON.stringify(value));
            return bytes < 6_000_000;
          }),
        );
      })
      .catch(() => {});
    return result;
  }
  async function memo(key, ttl, produce, allowStale = true) {
    await init();
    const saved = cache.get(key);
    if (saved && now() - saved.savedAt < ttl)
      return { ...saved.result, source: "cache" };
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      try {
        return await remember(key, await produce());
      } catch (error) {
        if (error.status === 404) {
          const invalid =
            key.startsWith("/repos/") && !key.endsWith("/readme")
              ? [key, `${key}/readme`]
              : [key];
          for (const name of invalid) cache.delete(name);
          await store
            ?.update("github-response-cache", (entries) => {
              const next = { ...entries };
              for (const name of invalid) delete next[name];
              return next;
            })
            .catch(() => {});
        }
        if (
          allowStale &&
          saved &&
          now() - saved.savedAt < STALE_TTL &&
          recoverable(error)
        )
          return {
            ...saved.result,
            source: "cache",
            stale: true,
            warning:
              "上游暂时不可用，正在展示此前保存的相同查询资料；时间为原采集时间。",
          };
        throw error;
      }
    })().finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  function limited(message, until) {
    return new GitHubError(message, 429, new Date(until).toISOString());
  }
  async function scheduled(name, url, options = {}, scheduling = {}) {
    await init();
    const lane = lanes[name];
    if (lane.until > now())
      throw limited("此数据源正在冷却，请稍后重试。", lane.until);
    if (lane.count >= 10)
      throw limited("读取请求较多，请稍后重试。", now() + MINUTE);
    lane.count++;
    const task = lane
      .work(async () => {
        let responsePromise;
        const turn = lane.queue.then(async () => {
          if (lane.until > now())
            throw limited("此数据源正在冷却，请稍后重试。", lane.until);
          if (lane.next > now()) await wait(lane.next - now());
          if (lane.until > now())
            throw limited("此数据源正在冷却，请稍后重试。", lane.until);
          lane.next =
            now() +
            (name === "search"
              ? searchInterval
              : name === "web"
                ? webInterval
                : 150);
          // Pace request starts, without serializing slow raw/core responses.
          responsePromise = fetchImpl(url, {
            ...options,
            redirect: "error",
            signal: AbortSignal.timeout(
              name === "raw" ? 4000 : name === "search" ? 12000 : 10000,
            ),
          });
        });
        lane.queue = turn.catch(() => {});
        await turn;
        const response = await responsePromise;
        if (
          [403, 429].includes(response.status) ||
          response.headers.get("x-ratelimit-remaining") === "0"
        ) {
          lane.until = retryTime(response.headers, now());
          await store
            ?.update("github-cooldowns", (saved) => ({
              ...saved,
              [name]: lane.until,
            }))
            .catch(() => {});
        }
        return response;
      }, scheduling)
      .finally(() => lane.count--);
    return task;
  }
  const restFetch = (url, options) =>
    scheduled(
      new URL(url).pathname.startsWith("/search/") ? "search" : "core",
      url,
      options,
    );
  const rest = (path) =>
    getGitHubData(path, {
      token,
      fetchImpl: restFetch,
      cacheState,
      clock: now,
    });
  const envelope = (data, provider, warning) => ({
    data,
    provider,
    source: "live",
    fetchedAt: new Date(now()).toISOString(),
    ...(warning ? { warning } : {}),
  });

  async function webPage(path, scheduling) {
    if (pages.has(path) && now() - pages.get(path).at < 10 * MINUTE)
      return pages.get(path).value;
    if (pagePending.has(path)) return pagePending.get(path);
    const operation = (async () => {
      let response;
      try {
        response = await scheduled("web", `https://github.com${path}`, {
          headers: {
            "User-Agent": "Open-Source-Observatory",
            Accept: "text/html",
          },
        }, scheduling);
      } catch (error) {
        if (error instanceof GitHubError) throw error;
        throw new GitHubError("暂时无法读取 GitHub 公开网页。", 502);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new GitHubError(
          "GitHub 公开网页暂不可用。",
          response.status === 404
            ? 404
            : [403, 429].includes(response.status)
              ? 429
              : 502,
          [403, 429].includes(response.status)
            ? new Date(lanes.web.until).toISOString()
            : null,
        );
      }
      let value;
      try {
        value = await boundedText(response, 3_000_000);
      } catch {
        throw new GitHubError("公开网页响应过大或读取中断。", 502);
      }
      // Never cache a login/challenge page as repository or search data.
      if (!value.includes("application/json"))
        throw new GitHubError("公开网页没有返回可验证的资料。", 502);
      if (pages.size >= 32) pages.delete(pages.keys().next().value);
      pages.set(path, { at: now(), value });
      return value;
    })().finally(() => pagePending.delete(path));
    pagePending.set(path, operation);
    return operation;
  }
  async function readPage(name, scheduling) {
    if (!validRepository(name)) throw new GitHubError("项目名称无效。", 400);
    const html = await webPage(`/${name}`, scheduling);
    try {
      return { ...parsePublicRepository(html, name), html };
    } catch (error) {
      pages.delete(`/${name}`);
      throw new GitHubError(
        "无法从公开网页核实这个仓库。",
        error.status === 404 ? 404 : 502,
      );
    }
  }
  async function searchWeb(params) {
    const size = Number(params.get("per_page") || 12),
      page = Number(params.get("page") || 1);
    const offset = (page - 1) * size;
    const first = Math.floor(offset / 10) + 1;
    const items = [];
    let total,
      incomplete = false;
    for (
      let current = first;
      current <= Math.ceil(Math.min(1000, offset + size) / 10);
      current++
    ) {
      const query = new URLSearchParams({
        q: params.get("q"),
        type: "repositories",
        p: String(current),
        o: "desc",
      });
      if (params.has("sort")) query.set("s", params.get("sort"));
      let parsed;
      try {
        parsed = parseRepositorySearch(
          await webPage(`/search?${query}`),
          current,
        );
      } catch (error) {
        pages.delete(`/search?${query}`);
        if (error instanceof GitHubError) throw error;
        throw new GitHubError(error.message, 502);
      }
      total ??= parsed.total_count;
      incomplete ||= parsed.incomplete_results;
      if (
        parsed.items.length !==
        Math.min(10, Math.max(0, Math.min(total, 1000) - (current - 1) * 10))
      )
        throw new GitHubError("搜索结果正在变化，请稍后重试。", 502);
      items.push(...parsed.items);
      if (current * 10 >= Math.min(total, 1000)) break;
    }
    return envelope(
      {
        items: items.slice(offset % 10, (offset % 10) + size),
        total_count: total,
        incomplete_results: incomplete,
      },
      "github-web",
      webNotice,
    );
  }
  async function search(params) {
    const size = Number(params.get("per_page")),
      page = Number(params.get("page"));
    // Three existing 12-item UI pages share one REST search request.
    const batch = new URLSearchParams(params);
    if (size === 12) {
      batch.set("per_page", "36");
      batch.set("page", String(Math.floor((page - 1) / 3) + 1));
    }
    batch.sort();
    const batchKey = `batch:/search/repositories?${batch}`;
    const savedBatch = cache.get(batchKey);
    const useWebRace =
      fastSearchFallback &&
      !pending.has(batchKey) &&
      !(savedBatch && now() - savedBatch.savedAt < 10 * MINUTE) &&
      (lanes.search.count > 0 || lanes.search.next - now() > 1200) &&
      lanes.web.until <= now();
    const fromApi = async () => {
      const result = await memo(
        batchKey,
        10 * MINUTE,
        async () => ({
          ...(await rest(`/search/repositories?${batch}`)),
          provider: "github-api",
        }),
        false,
      );
      const offset = size === 12 ? ((page - 1) % 3) * 12 : 0;
      return {
        ...result,
        data: {
          ...result.data,
          items: result.data.items.slice(
            offset,
            offset + Math.min(size, 1000 - (page - 1) * size),
          ),
        },
      };
    };
    // Both sources retain their pacing/cooldowns. A slow webpage must never
    // delay the already queued REST request; only verified responses can win.
    if (useWebRace) {
      try {
        return await Promise.any([fromApi(), searchWeb(params)]);
      } catch (errors) {
        throw (
          errors.errors.find((error) => !recoverable(error)) || errors.errors[0]
        );
      }
    }
    try {
      return await fromApi();
    } catch (error) {
      if (!recoverable(error)) throw error;
      return searchWeb(params);
    }
  }
  async function readme(name, knownRepo) {
    const metadata = knownRepo || (await github(`/repos/${name}`)).data;
    if (metadata.private !== false)
      throw new GitHubError("只能查看公开仓库。", 404);
    const paths = ["README.md", "README"];
    async function raw(path) {
      try {
        const url = `https://raw.githubusercontent.com/${name}/${encodeURIComponent(metadata.default_branch || "HEAD")}/${path.split("/").map(encodeURIComponent).join("/")}`;
        const response = await scheduled("raw", url);
        if (
          !response.ok ||
          response.headers.get("content-type")?.includes("text/html")
        ) {
          await response.body?.cancel();
          return null;
        }
        const content = await boundedText(response, 1_000_000);
        if (!content.trim()) return null;
        return envelope(
          {
            content: content.slice(0, 180000),
            path,
            html_url: `https://github.com/${name}#readme`,
            truncated: content.length > 180000,
            encoding: "utf-8",
          },
          "github-raw",
        );
      } catch {
        // A connection failure affects this host, not a particular README name.
        // Avoid repeating the same timeout for every file/candidate in the burst.
        lanes.raw.until = Math.max(lanes.raw.until, now() + 15_000);
        return null;
      }
    }
    for (const path of paths) {
      const result = await raw(path);
      if (result) return result;
    }
    try {
      const page = await readPage(name);
      if (!page.readme)
        throw new GitHubError("这个仓库还没有公开 README。", 404);
      const path = page.readme.path;
      if (
        typeof path !== "string" ||
        path.split("/").some((part) => [".", ".."].includes(part))
      )
        throw new GitHubError("README 路径无法确认。", 502);
      if (!paths.includes(path)) {
        const result = await raw(path);
        if (result) return result;
      }
      const content = readmeFromHtml(page.readme.html);
      if (!content) throw new GitHubError("README 内容暂不可用。", 502);
      return envelope(
        {
          content: content.slice(0, 180000),
          path,
          html_url: `https://github.com/${name}#readme`,
          truncated: content.length > 180000,
        },
        "github-web",
        "显示 GitHub 公开仓库页中的 README 文字；原始排版请前往 GitHub。",
      );
    } catch (error) {
      if (error.status === 404) throw error;
      return {
        ...(await rest(`/repos/${name}/readme`)),
        provider: "github-api",
      };
    }
  }
  async function github(path) {
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//")
    )
      throw new GitHubError("数据路径无效。", 400);
    const url = new URL(path, "https://api.github.com");
    const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)(\/readme)?$/);
    if (url.pathname === "/search/repositories") {
      const params = url.searchParams;
      if (!params.has("per_page")) params.set("per_page", "12");
      if (!params.has("page")) params.set("page", "1");
      if (!params.has("order")) params.set("order", "desc");
      const size = Number(params.get("per_page")),
        page = Number(params.get("page"));
      if (
        !params.get("q")?.trim() ||
        params.get("q").length > 600 ||
        ![12, 30].includes(size) ||
        !Number.isInteger(page) ||
        page < 1 ||
        (page - 1) * size >= 1000 ||
        ![null, "stars", "updated"].includes(params.get("sort")) ||
        params.get("order") !== "desc"
      )
        throw new GitHubError("搜索参数无效。", 400);
      if (!/(?:^|\s)is:public(?:\s|$)/.test(params.get("q")))
        params.set("q", `${params.get("q")} is:public`);
      params.sort();
      const result = await memo(
        `/search/repositories?${params}`,
        10 * MINUTE,
        () => search(params),
      );
      if (result.provider === "github-api") {
        for (const repo of result.data.items) {
          if (repo.private !== false || !validRepository(repo.full_name))
            continue;
          const key = `/repos/${repo.full_name}`;
          if (!cache.has(key))
            cache.set(key, {
              savedAt: Date.parse(result.fetchedAt),
              result: { ...result, data: repo },
            });
        }
        while (cache.size > 160) cache.delete(cache.keys().next().value);
      }
      return result;
    }
    if (match && validRepository(match[1])) {
      const name = match[1];
      return memo(
        url.pathname,
        match[2] ? 6 * 60 * MINUTE : 60 * MINUTE,
        async () => {
          if (match[2]) return readme(name);
          try {
            return { ...(await rest(url.pathname)), provider: "github-api" };
          } catch (error) {
            if (!recoverable(error)) throw error;
            return envelope(
              (await readPage(name)).data,
              "github-web",
              webNotice,
            );
          }
        },
      );
    }
    if (url.pathname === "/events")
      return memo(path, 2 * MINUTE, () => rest(path));
    throw new GitHubError("没有找到这个数据接口。", 404);
  }
  github.readPublicReadme = (repo) => {
    if (repo.private !== false || !validRepository(repo.full_name))
      throw new GitHubError("仅支持公开仓库资料。", 400);
    return memo(`/repos/${repo.full_name}/readme`, 6 * 60 * MINUTE, () =>
      readme(repo.full_name, repo),
    );
  };
  github.readPage = readPage;
  return github;
}
