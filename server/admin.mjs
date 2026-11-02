import { randomBytes, timingSafeEqual } from "node:crypto";
import { posix } from "node:path";
import { GitHubError } from "./github.mjs";

/** The maintenance interface is available only through this computer's loopback address. */
export function isLocalAdminRequest(req) {
  const peer = req.socket?.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) return false;
  try {
    const url = new URL(`http://${req.headers.host}`);
    return (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function routeAdminPage(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  let pathname;
  try { pathname = posix.normalize(decodeURIComponent(url.pathname).replaceAll("\\", "/")); }
  catch { return false; }
  if (!["/admin", "/admin/", "/admin.html"].includes(pathname)) return false;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  if (!isLocalAdminRequest(req)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("管理后台请在这台服务器上通过 http://localhost:4173/admin 打开。");
    return true;
  }
  req.url = `/admin.html${url.search}`;
  return false;
}

export function createAdminHandler({ library, store, model, trialModel }) {
  const token = randomBytes(32).toString("hex");
  const startedAt = new Date().toISOString();
  let mutating = false;
  async function snapshot() {
    const [libraryStatus, storage] = await Promise.all([
      library.status(),
      store.stats(),
    ]);
    return {
      token,
      server: {
        startedAt,
        uptime: process.uptime(),
        pid: process.pid,
        node: process.version,
        memoryBytes: process.memoryUsage().rss,
      },
      models: {
        cards: {
          configured: Boolean(model.configured),
          name: model.name || "未配置",
        },
        trials: {
          configured: Boolean(trialModel.configured),
          name: trialModel.name || "未配置",
        },
      },
      storage,
      library: libraryStatus,
    };
  }
  return async function handle(req, res) {
    if (!req.url?.startsWith("/api/admin/")) return false;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    try {
      if (!isLocalAdminRequest(req))
        throw new GitHubError(
          "请在服务器本机打开 http://localhost:4173/admin。",
          403,
        );
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new GitHubError("请从本机后台页面操作。", 403);
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/api/admin/status" && req.method === "GET") {
        send(200, {
          data: await snapshot(),
          fetchedAt: new Date().toISOString(),
        });
        return true;
      }
      if (path !== "/api/admin/library")
        throw new GitHubError("没有找到这个后台接口。", 404);
      if (req.method !== "POST")
        throw new GitHubError("请通过后台按钮提交操作。", 405);
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        throw new GitHubError("不支持其他站点的后台操作。", 403);
      const supplied = Buffer.from(String(req.headers["x-admin-token"] || ""));
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        throw new GitHubError("后台会话已更新，请刷新页面后再操作。", 403);
      if (
        !String(req.headers["content-type"] || "").startsWith(
          "application/json",
        )
      )
        throw new GitHubError("后台操作需要 JSON。", 415);
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2000) throw new GitHubError("后台请求过长。", 413);
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new GitHubError("后台请求格式无效。", 400);
      }
      if (!body || !["pause", "resume", "refresh"].includes(body.action))
        throw new GitHubError("不支持的后台操作。", 400);
      if (!library.enabled)
        throw new GitHubError(
          "请先配置中文模型并开启磁盘缓存与后台更新。",
          503,
        );
      if (mutating)
        throw new GitHubError("上一项操作正在提交，请稍后重试。", 409);
      mutating = true;
      let result;
      try {
        if (body.action === "pause") result = library.pause();
        else if (body.action === "resume") {
          await library.start();
          result = { running: true };
        } else {
          if (
            body.scope &&
            (typeof body.scope.q !== "string" ||
              typeof body.scope.sort !== "string")
          )
            throw new GitHubError("更新范围无效。", 400);
          result = await library.requestRefresh(body.scope || null);
        }
      } finally {
        mutating = false;
      }
      send(202, { data: result, fetchedAt: new Date().toISOString() });
    } catch (error) {
      send(error instanceof GitHubError ? error.status : 500, {
        error:
          error instanceof GitHubError
            ? error.message
            : "后台读取失败，请稍后重试。",
      });
    }
    return true;
  };
}
