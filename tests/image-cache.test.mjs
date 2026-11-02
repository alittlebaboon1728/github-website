import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import sharp from "sharp";
import { createStore } from "../server/storage.mjs";
import { createImageCache, imageSource } from "../server/image-cache.mjs";
import { createProjectMedia } from "../server/project-media.mjs";
import { createRepositoryMedia } from "../server/repository-media.mjs";

const source =
  "https://raw.githubusercontent.com/example/project/main/screenshot.png";
const avatar = "https://avatars.githubusercontent.com/u/123?v=4";
async function fixture(t, fetchImpl, options) {
  const dir = await mkdtemp(join(tmpdir(), "image-cache-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  const images = createImageCache(store, fetchImpl, options);
  return { dir, store, images };
}
const png = () =>
  sharp({
    create: { width: 1560, height: 800, channels: 3, background: "#567894" },
  })
    .png()
    .toBuffer();
const imageResponse = (bytes) =>
  new Response(bytes, { headers: { "content-type": "image/png" } });
async function serve(t, images) {
  const server = createServer(async (req, res) => {
    if (!(await images.handle(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("server thumbnails coalesce downloads, resize to WebP and restore from disk without the source", async (t) => {
  let calls = 0;
  const bytes = await png();
  const f = await fixture(t, async () => {
    calls++;
    return imageResponse(bytes);
  });
  const [first, second] = await Promise.all([
    f.images.prepare(source),
    f.images.prepare(source),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  assert.match(first.url, /^\/api\/observatory\/images\/[a-f0-9]{64}\.webp$/);
  assert.equal(first.width, 960);
  assert.ok(first.srcSet.includes("480w") && first.srcSet.includes("960w"));
  for (const candidate of first.srcSet.split(", ")) {
    const [url, width] = candidate.split(" ");
    const file = await readFile(join(f.dir, "images", url.split("/").at(-1)));
    const info = await sharp(file).metadata();
    assert.equal(info.format, "webp");
    assert.equal(info.width, Number(width.slice(0, -1)));
  }
  const restored = createImageCache(createStore(f.dir), () => {
    throw new Error("must reuse cached bytes");
  });
  assert.deepEqual(await restored.prepare(source), first);
  assert.deepEqual(await restored.peek(source), first);
  const statistics = await f.store.stats();
  assert.equal(statistics.images, 2);
  assert.ok(statistics.imageBytes > 0);
});

test("immutable same-origin images support conditional GET and HEAD and never proxy arbitrary input", async (t) => {
  const bytes = await png();
  const f = await fixture(t, async () => imageResponse(bytes));
  const image = await f.images.prepare(source);
  // New process/cache must serve only saved bytes, with no downloader activity.
  const base = await serve(
    t,
    createImageCache(createStore(f.dir), () => {
      throw new Error("network forbidden");
    }),
  );
  const response = await fetch(base + image.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.match(response.headers.get("cache-control"), /31536000, immutable/);
  assert.equal((await response.arrayBuffer()).byteLength, image.bytes);
  const head = await fetch(base + image.url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(image.bytes));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const unchanged = await fetch(base + image.url, {
    headers: { "If-None-Match": response.headers.get("etag") },
  });
  assert.equal(unchanged.status, 304);
  for (const path of [
    "https%3A%2F%2F127.0.0.1",
    "missing.webp",
    "a".repeat(64) + ".webp",
  ])
    assert.equal(
      (await fetch(base + "/api/observatory/images/" + path)).status,
      404,
    );
  assert.equal((await fetch(base + image.url, { method: "POST" })).status, 405);
});

test("avatar requests use 80px upstream and cache only an 80px WebP", async (t) => {
  assert.equal(
    new URL(
      imageSource("https://github.com/octocat.png?size=460", "avatar"),
    ).searchParams.get("size"),
    "80",
  );
  assert.throws(() => imageSource("https://github.com/octocat/keys", "avatar"));
  const bytes = await png();
  let requested;
  const f = await fixture(t, async (url) => {
    requested = url;
    return imageResponse(bytes);
  });
  const image = await f.images.prepare(avatar, "avatar");
  assert.equal(new URL(requested).searchParams.get("s"), "80");
  assert.equal(image.width, 80);
  assert.equal(image.height, 80);
  assert.equal(image.srcSet, undefined);
});

test("untrusted hosts, SVG, excessive bytes/pixels, unsuitable covers and unsafe redirects cannot enter the cache", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    throw new Error("should not fetch");
  });
  for (const url of [
    "http://127.0.0.1/img",
    "https://127.0.0.1/img",
    "https://github.com/login",
    "https://raw.githubusercontent.com:8443/img",
    "https://user:secret@raw.githubusercontent.com/img",
    "https://raw.githubusercontent.com.evil.test/img",
  ])
    assert.equal(await f.images.prepare(url), null);
  assert.equal(calls, 0);
  assert.throws(() =>
    imageSource("https://raw.githubusercontent.com/image", "avatar"),
  );
  const responses = [
    () =>
      new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"/>',
        { headers: { "content-type": "image/svg+xml" } },
      ),
    () =>
      new Response("big", {
        headers: { "content-length": String(11 * 1024 * 1024) },
      }),
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
            controller.close();
          },
        }),
      ),
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://untrusted.test/image" },
      }),
    async () =>
      imageResponse(
        await sharp({
          create: { width: 100, height: 50, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      ),
    // A valid PNG whose IHDR declares an enormous image is rejected before decompression.
    async () => {
      const bytes = Buffer.from(await png());
      bytes.writeUInt32BE(100000, 16);
      bytes.writeUInt32BE(100000, 20);
      return imageResponse(bytes);
    },
  ];
  for (const response of responses) {
    const candidate = await fixture(t, response);
    assert.equal(await candidate.images.prepare(source), null);
    assert.equal((await candidate.store.stats()).images, 0);
  }
});

test("expired images remain instant when refresh fails, failures back off, missing files are repaired", async (t) => {
  let time = 0,
    calls = 0;
  const bytes = await png();
  const f = await fixture(
    t,
    async () => {
      calls++;
      if (calls > 1) throw new Error("offline");
      return imageResponse(bytes);
    },
    { now: () => time },
  );
  const first = await f.images.prepare(source);
  time = 8 * 86400_000;
  assert.deepEqual(await f.images.prepare(source), first);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(await f.images.prepare(source), first);
  assert.equal(calls, 2);
  const file = first.url.split("/").at(-1);
  await unlink(join(f.dir, "images", file));
  let repairs = 0;
  const restored = createImageCache(f.store, async () => {
    repairs++;
    return imageResponse(bytes);
  });
  assert.equal(await restored.peek(source), null);
  assert.deepEqual(await restored.prepare(source), first);
  assert.equal(repairs, 1);
});

test("unusable images are remembered across restarts without retrying their original downloads", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    return new Response("<svg/>", {
      headers: { "content-type": "image/svg+xml" },
    });
  });
  assert.equal(await f.images.prepare(source), null);
  assert.equal((await f.images.inspect(source)).rejected, true);
  const restored = createImageCache(f.store, () => {
    calls++;
    throw new Error("must not refetch rejected image");
  });
  assert.equal(await restored.prepare(source), null);
  assert.equal(calls, 1);
  assert.equal((await f.store.stats()).images, 0);
});

test(
  "prepared lists include completed image descriptors without waiting for cold downloads",
  { timeout: 10_000 },
  async (t) => {
    const bytes = await png();
    let finish;
    const f = await fixture(t, async (url) => {
      if (new URL(url).pathname.startsWith("/u/")) return imageResponse(bytes);
      await new Promise((resolve) => {
        finish = resolve;
      });
      return imageResponse(bytes);
    });
    const metadata = createProjectMedia(
      f.store,
      undefined,
      async () => ({
        html: `<article class="markdown-body"><img src="${source}" alt="screenshot"/></article>`,
      }),
      f.images,
    );
    const media = createRepositoryMedia(metadata, f.images);
    const raw = {
      full_name: "example/project",
      private: false,
      owner: { avatar_url: avatar },
    };
    await f.images.prepare(avatar, "avatar");
    const cold = await media.decorate([raw]);
    assert.equal(cold[0].media, undefined);
    assert.match(cold[0].owner.avatar_url, /^\/api\/observatory\/images\//);
    for (let i = 0; !finish && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 2));
    assert.ok(finish);
    finish();
    await metadata.prepare("example/project");
    const warm = await media.decorate([raw]);
    assert.match(warm[0].media.image.url, /^\/api\/observatory\/images\//);
    assert.equal(warm[0].media.image.alt, "screenshot");
    assert.equal(
      warm[0].media.image.sourceUrl,
      "https://github.com/example/project#readme",
    );
    assert.equal(raw.media, undefined);
    const restored = createProjectMedia(
      createStore(f.dir),
      () => {
        throw new Error("offline");
      },
      undefined,
      createImageCache(createStore(f.dir), () => {
        throw new Error("offline");
      }),
    );
    assert.deepEqual(await restored("example/project"), warm[0].media);
  },
);
