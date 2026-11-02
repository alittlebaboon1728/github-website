import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleGitHubRequest } from "./server/github.mjs";
import { createObservatory } from "./server/observatory.mjs";
import { routeAdminPage } from "./server/admin.mjs";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const observatory = createObservatory({ DISCOVERY_BACKGROUND: "off", ...process.env, ...env });
  return {
    build: {
      rollupOptions: { input: { main: resolve(process.cwd(), "index.html"), admin: resolve(process.cwd(), "admin.html") } },
    },
    server: {
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/.git/**",
          "**/api.txt",
          "**/.data/**",
          "**/.build/**",
        ],
      },
    },
    plugins: [
      react(),
      {
        name: "github-public-api",
        configureServer(server) {
          void observatory.startBackground();
          server.httpServer?.once("close", () => void observatory.stopBackground());
          server.middlewares.use(async (req, res, next) => {
            if (routeAdminPage(req, res)) return;
            if (await observatory.handle(req, res)) return;
            if (!req.url?.startsWith("/api/github/")) return next();
            handleGitHubRequest(req, res, {
              github: observatory.github,
              library: observatory.library,
              media: observatory.media,
            });
          });
        },
        configurePreviewServer(server) {
          void observatory.startBackground();
          server.httpServer.once("close", () => void observatory.stopBackground());
          server.middlewares.use(async (req, res, next) => {
            if (routeAdminPage(req, res)) return;
            if (await observatory.handle(req, res)) return;
            if (!req.url?.startsWith("/api/github/")) return next();
            handleGitHubRequest(req, res, {
              github: observatory.github,
              library: observatory.library,
              media: observatory.media,
            });
          });
        },
      },
    ],
  };
});
