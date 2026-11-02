import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleGitHubRequest } from "./github.mjs";
import { createObservatory } from "./observatory.mjs";
import { routeAdminPage } from "./admin.mjs";

const observatory = createObservatory({
  ...process.env,
  DISCOVERY_BACKGROUND: process.env.DISCOVERY_BACKGROUND || "on",
});

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

createServer(async (req, res) => {
  if (routeAdminPage(req, res)) return;
  if (await observatory.handle(req, res)) return;
  if (await handleGitHubRequest(req, res, { github: observatory.github, library: observatory.library, media: observatory.media }))
    return;
  try {
    const pathname = decodeURIComponent(
      new URL(req.url || "/", "http://localhost").pathname,
    );
    const path = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (
      path !== root &&
      !path.startsWith(root.endsWith(sep) ? root : root + sep)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not-file");
    const content = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("没有找到这个页面。");
  }
}).listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`Open Source Observatory: http://localhost:${port}`);
  observatory.startBackground().catch(() => console.error("中文项目库初始化失败，已有页面仍可读取。"));
  // Collection is optional; visits also collect snapshots. Only one process should own the data directory.
  if (process.env.OBSERVATORY_COLLECT === "on") {
    observatory.collect();
    setInterval(() => observatory.collect(), 6 * 60 * 60 * 1000).unref();
  }
});
