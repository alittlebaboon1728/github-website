import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/storage.mjs";
import {
  createProjectMedia,
  selectProjectImage,
} from "../server/project-media.mjs";

const article = (body) =>
  `<article class="markdown-body entry-content">${body}</article>`;
test("README media prefers actual screenshots and skips badges, logos and tiny images", () => {
  const result = selectProjectImage(
    article(`
    <img src="https://camo.githubusercontent.com/badge" data-canonical-src="https://img.shields.io/build" />
    <img src="https://raw.githubusercontent.com/org/repo/main/logo.png" alt="logo" />
    <img src="https://raw.githubusercontent.com/org/repo/main/tiny.png" width="100" />
    <img src="https://raw.githubusercontent.com/org/repo/main/architecture.png" />
    <img src="https://github.com/user-attachments/assets/example?a=1&amp;b=2" alt="界面预览" />
  `),
    "org/repo",
  );
  assert.equal(
    result.url,
    "https://github.com/user-attachments/assets/example?a=1&b=2",
  );
  assert.equal(result.alt, "界面预览");
  assert.equal(result.sourceUrl, "https://github.com/org/repo#readme");
});

test("text-only README and unsupported media have no placeholder image", () => {
  assert.equal(
    selectProjectImage(
      '<img src="https://raw.githubusercontent.com/org/repo/main/outside.png">' +
        article("<p>Text only</p>"),
      "org/repo",
    ),
    null,
  );
  for (const url of [
    "javascript:alert(1)",
    "http://127.0.0.1/picture.png",
    "https://untrusted.example/screenshot.png",
    "https://github.com/login",
    "https://raw.githubusercontent.com/org/repo/main/logo.svg",
  ])
    assert.equal(
      selectProjectImage(article(`<img src="${url}" />`), "org/repo"),
      null,
    );
});

test("camo-wrapped SVG and contributor badges are filtered, and signed attachments use a stable public identity", () => {
  const camo = (url) =>
    `https://camo.githubusercontent.com/hash/${Buffer.from(url).toString("hex")}`;
  for (const original of [
    "https://railway.app/button.svg",
    "https://contrib.rocks/image?repo=org/repo",
  ])
    assert.equal(
      selectProjectImage(article(`<img src="${camo(original)}">`), "org/repo"),
      null,
    );
  const id = "fa2cdf79-c933-4b93-844a-b087192261ed";
  const result = selectProjectImage(
    article(
      `<img src="https://private-user-images.githubusercontent.com/123/456-${id}.png?jwt=expired-fixture" alt="项目截图">`,
    ),
    "org/repo",
  );
  assert.equal(result.url, `https://github.com/user-attachments/assets/${id}`);
  assert.ok(!result.url.includes("jwt"));
});

test("media requests validate repository names, coalesce and persist results without model calls", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "project-media-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  let calls = 0;
  const fetchMedia = async (url, options) => {
    calls++;
    assert.equal(url, "https://github.com/org/repo");
    assert.equal(options.redirect, "error");
    return new Response(
      article(
        '<img src="https://raw.githubusercontent.com/org/repo/main/screenshot.png" alt="项目截图"/>',
      ),
    );
  };
  const load = createProjectMedia(store, fetchMedia);
  for (const name of [
    null,
    "https://example.com/a",
    "../repo",
    "org/..",
    "org/repo?x=1",
  ])
    await assert.rejects(() => load(name), /项目名称无效/);
  assert.equal(calls, 0);
  const [first, second] = await Promise.all([
    load("org/repo"),
    load("org/repo"),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  assert.deepEqual(
    await createProjectMedia(store, fetchMedia)("org/repo"),
    first,
  );
  assert.equal(calls, 1);
});

test("empty image results are cached and unavailable repositories remain errors", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "project-media-empty-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  let calls = 0;
  const load = createProjectMedia(store, async () => {
    calls++;
    return new Response(article("<p>No image</p>"));
  });
  assert.deepEqual(await load("org/text"), { image: null });
  assert.deepEqual(await load("org/text"), { image: null });
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      createProjectMedia(
        store,
        async () => new Response("Missing", { status: 404 }),
      )("org/missing"),
    /暂无可用/,
  );
});
