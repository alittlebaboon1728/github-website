import { createHash } from "node:crypto";
import sharp from "sharp";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const prefix = "/api/observatory/images/";
const maxBytes = 10 * 1024 * 1024;
class UnsuitableImage extends Error {}
const hosts = new Set([
  "raw.githubusercontent.com",
  "camo.githubusercontent.com",
  "user-images.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);
export function imageSource(value, kind = "cover") {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("unsupported-image-source");
  if (kind === "avatar") {
    const cdn =
      /^avatars[0-3]?\.githubusercontent\.com$/.test(url.hostname) &&
      /^\/(?:u|in)\/\d+$/.test(url.pathname);
    const profile =
      url.hostname === "github.com" &&
      /^\/[a-z0-9][a-z0-9-]{0,38}\.png$/i.test(url.pathname);
    if (!cdn && !profile) throw new Error("unsupported-avatar-source");
    url.searchParams.set(profile ? "size" : "s", "80");
  } else if (
    !hosts.has(url.hostname) &&
    !(
      url.hostname === "github.com" &&
      url.pathname.startsWith("/user-attachments/assets/")
    )
  ) {
    throw new Error("unsupported-image-source");
  }
  url.hash = "";
  return url.href;
}

async function download(source, kind, fetchImpl) {
  let url = imageSource(source, kind);
  // GitHub's numbered avatar CDN remains reachable on networks where the primary host stalls.
  if (kind === "avatar") {
    const mirror = new URL(url);
    if (mirror.hostname === "avatars.githubusercontent.com")
      mirror.hostname = "avatars0.githubusercontent.com";
    url = mirror.href;
  }
  const signal = AbortSignal.timeout(12_000);
  for (let hop = 0; hop <= 3; hop++) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "Open-Source-Observatory",
        Accept: "image/avif,image/webp,image/*",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (hop === 3 || !response.headers.get("location"))
        throw new Error("image-redirect-limit");
      url = imageSource(
        new URL(response.headers.get("location"), url).href,
        kind,
      );
      continue;
    }
    if (
      response.status === 404 ||
      /svg/i.test(response.headers.get("content-type") || "")
    ) {
      await response.body?.cancel();
      throw new UnsuitableImage("unsupported-project-image");
    }
    if (
      !response.ok ||
      !response.body ||
      /svg|text\/|json|xml/i.test(response.headers.get("content-type") || "")
    ) {
      await response.body?.cancel();
      throw new Error("image-unavailable");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      if (Number(response.headers.get("content-length")) > maxBytes)
        throw new Error("image-too-large");
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) throw new Error("image-too-large");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks);
  }
}

/** Download once on the server. Public URLs only read finished, content-addressed WebP files. */
export function createImageCache(
  store,
  fetchImpl = fetch,
  { now = Date.now, concurrency = 4 } = {},
) {
  const entries = new Map(),
    reads = new Map(),
    pending = new Map(),
    failures = new Map();
  const blobs = new Map(),
    queue = [];
  let active = 0,
    memoryBytes = 0;
  const remember = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > 2000) entries.delete(entries.keys().next().value);
    return entry;
  };
  const retain = (name, bytes) => {
    if (blobs.has(name)) return;
    blobs.set(name, bytes);
    memoryBytes += bytes.length;
    while (memoryBytes > 32 * 1024 * 1024 && blobs.size > 1) {
      const first = blobs.keys().next().value;
      memoryBytes -= blobs.get(first).length;
      blobs.delete(first);
    }
  };
  const keyFor = (source, kind) =>
    `image-v1-${digest(`${kind}:${imageSource(source, kind)}`)}`;
  async function saved(source, kind) {
    const key = keyFor(source, kind);
    if (entries.has(key)) {
      const entry = entries.get(key);
      if (!entry.rejected || now() - entry.checkedAt < 86400_000) return entry;
      entries.delete(key);
    }
    if (reads.has(key)) return reads.get(key);
    const operation = (async () => {
      const entry = await store.read(key).catch(() => null);
      if (entry?.rejected && now() - entry.checkedAt < 86400_000)
        return remember(key, entry);
      if (
        entry?.files?.length &&
        (await Promise.all(
          entry.files.map((name) => store.hasAsset(name)),
        ).then((values) => values.every(Boolean)))
      )
        return remember(key, entry);
      return null;
    })().finally(() => reads.delete(key));
    reads.set(key, operation);
    return operation;
  }
  function drain() {
    while (active < concurrency && queue.length) {
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
  }
  async function produce(source, kind, key) {
    const input = await download(source, kind, fetchImpl);
    const options = {
      animated: false,
      limitInputPixels: 40_000_000,
      failOn: "error",
    };
    const meta = await sharp(input, options).metadata();
    if (!["jpeg", "png", "webp", "gif", "avif", "heif"].includes(meta.format))
      throw new UnsuitableImage("unsupported-image-format");
    const swapped = meta.orientation >= 5;
    const width = swapped ? meta.height : meta.width,
      height = swapped ? meta.width : meta.height;
    if (kind === "cover" && (width < 240 || height < 100 || width / height > 6))
      throw new UnsuitableImage("unsuitable-project-image");
    const variants = [];
    for (const size of kind === "avatar" ? [80] : [480, 960]) {
      if (variants.length && variants.at(-1).width === Math.min(size, width))
        continue;
      const { data, info } = await sharp(input, options)
        .rotate()
        .resize({
          width: size,
          ...(kind === "avatar"
            ? { height: size, fit: "cover" }
            : { withoutEnlargement: true }),
        })
        .webp({ quality: kind === "avatar" ? 78 : 76, effort: 3 })
        .toBuffer({ resolveWithObject: true });
      const name = `${digest(data)}.webp`;
      await store.writeAsset(name, data);
      retain(name, data);
      variants.push({
        url: prefix + name,
        width: info.width,
        height: info.height,
        bytes: info.size,
      });
    }
    const largest = variants.at(-1);
    const entry = {
      checkedAt: now(),
      files: variants.map((v) => v.url.slice(prefix.length)),
      image: {
        ...largest,
        ...(kind === "cover"
          ? { srcSet: variants.map((v) => `${v.url} ${v.width}w`).join(", ") }
          : {}),
      },
    };
    await store.update(key, () => entry);
    failures.delete(key);
    return remember(key, entry);
  }
  function schedule(source, kind, key) {
    if (pending.has(key)) return pending.get(key);
    if (failures.get(key) > now()) return Promise.resolve(null);
    if (queue.length >= 1000) return Promise.resolve(null);
    const operation = new Promise((resolve, reject) => {
      queue.push({ resolve, reject, run: () => produce(source, kind, key) });
      drain();
    })
      .catch(async (error) => {
        if (error instanceof UnsuitableImage) {
          const previous = entries.get(key);
          if (previous?.image) {
            failures.set(key, now() + 5 * 60_000);
            return previous;
          }
          const entry = {
            checkedAt: now(),
            rejected: true,
            files: [],
            image: null,
          };
          await store.update(key, () => entry).catch(() => {});
          return remember(key, entry);
        }
        failures.set(key, now() + 5 * 60_000);
        if (failures.size > 2000) failures.delete(failures.keys().next().value);
        return null;
      })
      .finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  return {
    async inspect(source, kind = "cover") {
      try {
        return await saved(source, kind);
      } catch {
        return null;
      }
    },
    async peek(source, kind = "cover") {
      try {
        return (await saved(source, kind))?.image || null;
      } catch {
        return null;
      }
    },
    async prepare(source, kind = "cover") {
      let key;
      try {
        key = keyFor(source, kind);
      } catch {
        return null;
      }
      const entry = await saved(source, kind);
      if (entry) {
        // Serve durable old bytes immediately while revalidating in the background.
        if (now() - entry.checkedAt > 7 * 86400_000)
          void schedule(source, kind, key);
        return entry.image;
      }
      return (await schedule(source, kind, key))?.image || null;
    },
    async handle(req, res) {
      const path = new URL(req.url, "http://localhost").pathname;
      if (!path.startsWith(prefix)) return false;
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return true;
      }
      const name = path.slice(prefix.length);
      let bytes;
      if (/^[a-f0-9]{64}\.webp$/.test(name)) {
        bytes =
          blobs.get(name) || (await store.readAsset(name).catch(() => null));
        if (bytes) retain(name, bytes);
      }
      if (!bytes) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return true;
      }
      const etag = `"${name}"`;
      const headers = {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        ETag: etag,
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers);
        res.end();
        return true;
      }
      res.writeHead(200, { ...headers, "Content-Length": bytes.length });
      res.end(req.method === "HEAD" ? undefined : bytes);
      return true;
    },
  };
}
