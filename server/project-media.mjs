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
function canonicalImageSource(src) {
  try {
    const url = new URL(src);
    if (url.hostname === "camo.githubusercontent.com") {
      const encoded = url.pathname.split("/")[2];
      if (
        encoded &&
        encoded.length < 12000 &&
        /^(?:[a-f0-9]{2})+$/i.test(encoded)
      )
        return Buffer.from(encoded, "hex").toString("utf8");
    }
  } catch {
    /* Relative README images use the normal URL resolver. */
  }
  return src;
}
function stableImageSource(src, canonical) {
  try {
    const url = new URL(src);
    if (url.hostname === "private-user-images.githubusercontent.com") {
      // GitHub HTML may contain a five-minute signed CDN URL. Save the public attachment identity.
      const id = url.pathname.match(
        /^\/\d+\/\d+-([a-f0-9-]{36})\.[a-z0-9]+$/i,
      )?.[1];
      if (id) return `https://github.com/user-attachments/assets/${id}`;
      if (canonical?.startsWith("https://github.com/user-attachments/assets/"))
        return canonical;
    }
  } catch {
    /* The allowlist below rejects an invalid source. */
  }
  return src;
}
export function selectProjectImage(html, fullName) {
  const article = html.match(
    /<article\b[^>]*class="[^"]*\bmarkdown-body\b[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
  )?.[1];
  if (!article) return null;
  const choices = [];
  for (const match of article.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0],
      src = attribute(tag, "src"),
      original =
        attribute(tag, "data-canonical-src") || canonicalImageSource(src),
      alt = attribute(tag, "alt");
    const hint = `${original} ${alt}`;
    const width = Number(attribute(tag, "width")),
      height = Number(attribute(tag, "height"));
    if (
      !src ||
      /badge|shields\.io|img\.shields|buymeacoffee|ko-fi|sponsor|contrib\.rocks|contributors|stargazers|star-history|github-readme-stats|visitor|license|\/logo[./_-]|\/icon[./_-]|avatars\.|\.svg(?:[?#\s]|$)/i.test(
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
      url = new URL(
        stableImageSource(src, original),
        `https://github.com/${fullName}/`,
      );
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
export function createProjectMedia(store, fetchImpl = fetch, readPage, images) {
  const pending = new Map();
  const savedEntries = new Map(),
    reads = new Map();
  const validate = (fullName) => {
    if (
      typeof fullName !== "string" ||
      !/^([\w.-]{1,100})\/([\w.-]{1,100})$/.test(fullName) ||
      fullName.split("/").some((part) => part === "." || part === "..")
    )
      throw new GitHubError("项目名称无效。", 400);
    return fullName.toLowerCase();
  };
  const fileKey = (name) =>
    `project-media-${createHash("sha256").update(name).digest("hex")}`;
  const remember = (name, value) => {
    savedEntries.set(name, value);
    if (savedEntries.size > 2000)
      savedEntries.delete(savedEntries.keys().next().value);
    return value;
  };
  async function readSaved(name) {
    if (savedEntries.has(name)) return savedEntries.get(name);
    if (reads.has(name)) return reads.get(name);
    const operation = store
      .read(fileKey(name))
      .catch(() => null)
      .then((value) => {
        if (!value) return null;
        if (value.image) {
          const escape = (text) =>
            String(text || "")
              .replaceAll("&", "&amp;")
              .replaceAll('"', "&quot;")
              .replaceAll("<", "&lt;");
          const checked = selectProjectImage(
            `<article class="markdown-body"><img src="${escape(value.image.url)}" alt="${escape(value.image.alt)}"></article>`,
            name,
          );
          value = {
            ...value,
            image: checked,
            ...(checked ? {} : { checkedAt: 0 }),
          };
        }
        return remember(name, value);
      })
      .finally(() => reads.delete(name));
    reads.set(name, operation);
    return operation;
  }
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
  const refresh = async (fullName) => {
    const name = validate(fullName);
    if (pending.has(name)) return pending.get(name);
    const operation = (async () => {
      const key = fileKey(name);
      if (queue.length >= 1000)
        throw new GitHubError("图片资料暂时繁忙。", 429);
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
              remember(name, { checkedAt: Date.now(), image });
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
            remember(name, { checkedAt: Date.now(), image });
            return { image };
          },
        });
        drain();
      });
    })().finally(() => pending.delete(name));
    pending.set(name, operation);
    return operation;
  };
  const localize = async (image, cachedOnly = false, wait = false) => {
    if (!image || !images) return { image };
    const local = await images[wait ? "prepare" : "peek"](image.url);
    if (!local && !cachedOnly && !wait)
      void images.prepare(image.url).catch(() => {});
    if (!local && (await images.inspect(image.url))?.rejected)
      return { image: null };
    if (!local) return cachedOnly ? undefined : { image, pending: true };
    return { image: { ...image, ...local } };
  };
  const load = async (fullName, wait = false) => {
    const name = validate(fullName);
    const saved = await readSaved(name);
    if (saved) {
      if (
        Date.now() - saved.checkedAt >=
        (saved.image ? 7 * 86400_000 : 3600_000)
      )
        void refresh(fullName).catch(() => {});
      return localize(saved.image, false, wait);
    }
    return localize((await refresh(fullName)).image, false, wait);
  };
  load.prepare = (fullName) => load(fullName, true);
  load.cached = async (fullName) => {
    const saved = await readSaved(validate(fullName));
    return saved ? localize(saved.image, true) : undefined;
  };
  return load;
}
