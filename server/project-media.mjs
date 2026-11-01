import { createHash } from "node:crypto";
import { GitHubError } from "./github.mjs";
import { boundedText } from "./storage.mjs";

const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const attribute = (tag, name) =>
  decode(
    tag.match(new RegExp(`(?:^|\\s)${name}\\s*=["']([^"']*)["']`, "i"))?.[1] ||
      "",
  );
export function selectProjectImage(html, fullName) {
  const article = html.match(
    /<article\b[^>]*class="[^"]*\bmarkdown-body\b[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
  )?.[1];
  if (!article) return null;
  const choices = [];
  for (const match of article.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0],
      src = attribute(tag, "src"),
      original = attribute(tag, "data-canonical-src") || src,
      alt = attribute(tag, "alt");
    const hint = `${original} ${alt}`;
    const width = Number(attribute(tag, "width")),
      height = Number(attribute(tag, "height"));
    if (
      !src ||
      /badge|shields\.io|img\.shields|buymeacoffee|ko-fi|sponsor|contributors|stargazers|star-history|github-readme-stats|visitor|license|\/logo[./_-]|\/icon[./_-]|avatars\.|\.svg(?:\?|$)/i.test(
        hint,
      )
    )
      continue;
    if (
      (width > 0 && width < 240) ||
      (height > 0 && height < 100) ||
      /^logo$|^icon$|^头像$/i.test(alt.trim())
    )
      continue;
    let url;
    try {
      url = new URL(src, `https://github.com/${fullName}/`);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      if (
        ![
          "github.com",
          "raw.githubusercontent.com",
          "camo.githubusercontent.com",
          "user-images.githubusercontent.com",
          "private-user-images.githubusercontent.com",
        ].includes(url.hostname)
      )
        continue;
      if (
        url.hostname === "github.com" &&
        !url.pathname.startsWith("/user-attachments/assets/")
      )
        continue;
    } catch {
      continue;
    }
    choices.push({
      url: url.href,
      alt: alt.trim() || `${fullName} README 项目图片`,
      sourceUrl: `https://github.com/${fullName}#readme`,
      score:
        /screenshot|preview|demo|screen|showcase|截图|预览|界面|演示/i.test(
          hint,
        )
          ? 2
          : 1,
    });
  }
  choices.sort((a, b) => b.score - a.score);
  if (!choices.length) return null;
  const { score, ...image } = choices[0];
  return image;
}
export function createProjectMedia(store, fetchImpl = fetch, readPage) {
  const pending = new Map();
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < 3 && queue.length) {
      const work = queue.shift();
      active++;
      Promise.resolve()
        .then(work.run)
        .then(work.resolve, work.reject)
        .finally(() => {
          active--;
          drain();
        });
    }
  };
  return async (fullName) => {
    if (
      typeof fullName !== "string" ||
      !/^([\w.-]{1,100})\/([\w.-]{1,100})$/.test(fullName) ||
      fullName.split("/").some((part) => part === "." || part === "..")
    )
      throw new GitHubError("项目名称无效。", 400);
    const name = fullName.toLowerCase();
    if (pending.has(name)) return pending.get(name);
    const operation = (async () => {
      const key = `project-media-${createHash("sha256").update(name).digest("hex")}`;
      const saved = await store.read(key).catch(() => null);
      if (
        saved &&
        Date.now() - saved.checkedAt < (saved.image ? 7 * 86400_000 : 3600_000)
      )
        return { image: saved.image };
      if (queue.length >= 60) throw new GitHubError("图片资料暂时繁忙。", 429);
      return new Promise((resolve, reject) => {
        queue.push({
          resolve,
          reject,
          run: async () => {
            if (readPage) {
              const page = await readPage(fullName);
              const image = selectProjectImage(
                page.readme?.html || page.html,
                fullName,
              );
              await store
                .update(key, () => ({ checkedAt: Date.now(), image }))
                .catch(() => {});
              return { image };
            }
            const response = await fetchImpl(`https://github.com/${fullName}`, {
              redirect: "error",
              signal: AbortSignal.timeout(10000),
              headers: { "User-Agent": "Open-Source-Observatory" },
            });
            if (!response.ok) {
              await response.body?.cancel();
              throw new GitHubError(
                "暂无可用的项目图片。",
                response.status === 404 ? 404 : 502,
              );
            }
            const image = selectProjectImage(
              await boundedText(response, 2_000_000),
              fullName,
            );
            await store
              .update(key, () => ({ checkedAt: Date.now(), image }))
              .catch(() => {});
            return { image };
          },
        });
        drain();
      });
    })().finally(() => pending.delete(name));
    pending.set(name, operation);
    return operation;
  };
}
