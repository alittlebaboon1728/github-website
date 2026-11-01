import { GitHubError } from "./github.mjs";
import { validTrialRepo } from "./trials.mjs";

export function createTrialHandler(service) {
  const attempts = new Map();
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/api/observatory/trials") return false;
    try {
      let data;
      if (req.method === "GET") {
        const repo = url.searchParams.get("repo");
        if (repo !== null && !validTrialRepo(repo))
          throw new GitHubError("项目名称无效。", 400);
        data = repo ? await service.get(repo) : await service.list();
      } else if (req.method === "POST") {
        let sameOrigin = true;
        try {
          if (req.headers.origin)
            sameOrigin = new URL(req.headers.origin).host === req.headers.host;
        } catch {
          sameOrigin = false;
        }
        if (!sameOrigin || req.headers["sec-fetch-site"] === "cross-site")
          throw new GitHubError("不接受其他站点的试用生成请求。", 403);
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw new GitHubError("试用生成需要 JSON 请求。", 415);
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 2000) throw new GitHubError("试用请求过长。", 413);
          chunks.push(chunk);
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new GitHubError("试用请求格式无效。", 400);
        }
        if (
          !body ||
          !validTrialRepo(body.repo) ||
          (body.regenerate !== undefined &&
            typeof body.regenerate !== "boolean")
        )
          throw new GitHubError("试用请求格式无效。", 400);
        const address = req.socket.remoteAddress || "local",
          now = Date.now();
        let attempt = attempts.get(address);
        if (!attempt || now - attempt.at > 60_000)
          attempt = { at: now, count: 0 };
        if (attempt.count >= 6)
          throw new GitHubError("生成请求较频繁，请一分钟后重试。", 429);
        if (attempts.size >= 500) attempts.delete(attempts.keys().next().value);
        attempts.set(address, attempt);
        attempt.count++;
        data = await service.start(body.repo, body.regenerate);
      } else throw new GitHubError("此接口只支持读取和生成试用。", 405);
      res.writeHead(req.method === "POST" ? 202 : 200);
      res.end(
        JSON.stringify({
          data,
          source: "live",
          fetchedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      res.writeHead(error instanceof GitHubError ? error.status : 500);
      res.end(
        JSON.stringify({
          error:
            error instanceof GitHubError
              ? error.message
              : "试用服务暂时不可用，请稍后重试。",
        }),
      );
    }
    return true;
  };
}
