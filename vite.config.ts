import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleGitHubRequest } from "./server/github.mjs";
import { createObservatory } from "./server/observatory.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const observatory = createObservatory({ ...process.env, ...env });
  return {
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
          server.middlewares.use(async (req, res, next) => {
            if (await observatory.handle(req, res)) return;
            if (!req.url?.startsWith("/api/github/")) return next();
            handleGitHubRequest(req, res, {
              github: observatory.github,
            });
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (await observatory.handle(req, res)) return;
            if (!req.url?.startsWith("/api/github/")) return next();
            handleGitHubRequest(req, res, {
              github: observatory.github,
            });
          });
        },
      },
    ],
  };
});
