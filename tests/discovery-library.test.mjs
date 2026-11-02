import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiscoveryLibrary } from "../server/discovery-library.mjs";
import { createStore } from "../server/storage.mjs";
import { GitHubError, handleGitHubRequest } from "../server/github.mjs";
import { createObservatory } from "../server/observatory.mjs";
import { rankingQuery } from "../server/trends.mjs";
import { createHash } from "node:crypto";

const categories = [
  { id: "web", query: "topic:web-application" },
  { id: "data", query: "topic:database" },
];
const envelope = (data, at) => ({
  data,
  source: "live",
  fetchedAt: new Date(at).toISOString(),
});
const repo = (name) => ({
  full_name: `test/${name}`,
  name,
  private: false,
  description: "Real public project",
});
const card = (name) => ({
  fullName: name,
  summary: "根据公开项目资料整理的中文说明。",
});
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "discovery-library-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  let time = Date.parse("2026-11-01T00:00:00Z");
  const summaries = new Map();
  const calls = [],
    preparations = [];
  const github = async (path) => {
    const url = new URL(path, "http://local");
    calls.push(path);
    const page = Number(url.searchParams.get("page"));
    const name = `${url.searchParams.get("q").includes("database") ? "data" : "web"}-${page}`;
    return envelope(
      { items: [repo(name)], total_count: 100, incomplete_results: false },
      time,
    );
  };
  const cards = {
    cached: async (repos) =>
      Object.fromEntries(
        repos
          .filter((r) => summaries.has(r.full_name))
          .map((r) => [r.full_name, summaries.get(r.full_name)]),
      ),
    prepare: async (repos, { onCard, priority }) => {
      preparations.push({ repos, priority });
      const result = {};
      for (const r of repos) {
        const value = card(r.full_name);
        summaries.set(r.full_name, value);
        result[r.full_name] = value;
        await onCard?.(r, value);
      }
      return { cards: result, errors: {} };
    },
  };
  const config = {
    github,
    cards,
    store,
    defaults: categories,
    now: () => time,
    ...options,
  };
  return {
    dir,
    store,
    calls,
    preparations,
    summaries,
    github,
    cards,
    config,
    library: createDiscoveryLibrary(config),
    advance: (ms) => (time += ms),
  };
}

test("unattended worker prepares every default first page before deeper pages and persists all Chinese lists", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 6; i++) assert.equal(await f.library.tick(), true);
  assert.equal(await f.library.tick(), false);
  assert.deepEqual(
    f.calls.map((path) =>
      new URL(path, "http://local").searchParams.get("page"),
    ),
    ["1", "1", "2", "2", "3", "3"],
  );
  assert.ok(f.preparations.every((p) => p.priority < 0));
  const initial = await f.library.bootstrap();
  assert.equal(initial.pages.length, 6);
  for (const { result } of initial.pages) {
    assert.equal(result.data.prepared, true);
    assert.equal(result.data.pending_count, 0);
    assert.equal(
      result.data.cards[result.data.items[0].full_name].summary,
      "根据公开项目资料整理的中文说明。",
    );
  }
  assert.equal(
    (await readdir(f.dir)).filter((name) => name.startsWith("discovery-page-"))
      .length,
    6,
  );
});

test("fresh process reads durable pages after expiry without waiting for either upstream or model", async (t) => {
  const f = await fixture(t);
  await f.library.tick();
  f.advance(40 * 24 * 3600_000);
  const fail = () => {
    throw new Error("must never run on a cached read");
  };
  const restored = createDiscoveryLibrary({
    ...f.config,
    github: fail,
    cards: { cached: fail, prepare: fail },
  });
  const result = await restored.search({
    q: "topic:web-application is:public",
    page: 1,
  });
  assert.equal(result.data.items[0].full_name, "test/web-1");
  assert.equal(result.data.cards["test/web-1"].summary.includes("中文"), true);
  assert.equal(result.stale, true);
  for (let i = 0; i < 6; i++) await restored.tick();
  assert.equal(
    (await restored.search({ q: "topic:web-application" })).data.items[0]
      .full_name,
    "test/web-1",
  );
  assert.ok((await restored.status()).scopes[0].prepared[0].error);
});

test("failed partial replacement preserves last complete Chinese page", async (t) => {
  const f = await fixture(t);
  await f.library.tick();
  f.advance(31 * 60_000);
  const replacement = createDiscoveryLibrary({
    ...f.config,
    defaults: [categories[0]],
    github: async () =>
      envelope({ items: [repo("new-project")], total_count: 100 }, Date.now()),
    cards: {
      cached: async () => ({}),
      prepare: async () => ({
        cards: {},
        errors: { "test/new-project": "temporarily unavailable" },
      }),
    },
  });
  // Restored unattempted default pages are visited first; eventually page one is refreshed.
  for (let i = 0; i < 6; i++) await replacement.tick();
  const result = await replacement.search({ q: categories[0].query });
  assert.equal(result.data.items[0].full_name, "test/web-1");
  assert.equal(result.data.pending_count, 0);
});

test("cold GET returns cached Chinese only and leaves missing summaries to background work", async (t) => {
  const f = await fixture(t, { defaults: [] });
  let finish;
  let modelStarted = false;
  f.cards.prepare = async (repos, { onCard }) => {
    modelStarted = true;
    await new Promise((resolve) => {
      finish = resolve;
    });
    const value = card(repos[0].full_name);
    await onCard(repos[0], value);
    return { cards: { [value.fullName]: value }, errors: {} };
  };
  const initial = await f.library.search({ q: "topic:database" });
  assert.equal(modelStarted, false);
  assert.equal(initial.data.items.length, 0);
  assert.equal(initial.data.pending_count, 1);
  const working = f.library.tick();
  for (let i = 0; !finish && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(modelStarted, true);
  const during = await f.library.search({ q: "topic:database" });
  assert.equal(during.data.pending_count, 1);
  finish();
  await working;
  const ready = await f.library.search({ q: "topic:database" });
  assert.equal(ready.data.pending_count, 0);
  assert.equal(ready.data.items.length, 1);
  assert.equal(f.calls.length, 1);
});

test("missing summaries retry after failure and never expose original-only cards", async (t) => {
  const f = await fixture(t, { defaults: [categories[1]] });
  f.cards.prepare = async () => ({
    cards: {},
    errors: { "test/data-1": "failure" },
  });
  await f.library.tick();
  let result = await f.library.search({ q: "topic:database" });
  assert.equal(result.data.items.length, 0);
  assert.match(result.data.preparation_error, /重试/);
  f.cards.prepare = async (repos, { onCard }) => {
    const value = card(repos[0].full_name);
    await onCard(repos[0], value);
    return { cards: { [value.fullName]: value }, errors: {} };
  };
  await f.library.tick();
  await f.library.tick();
  f.advance(121_000);
  await f.library.tick();
  result = await f.library.search({ q: "topic:database" });
  assert.equal(result.data.pending_count, 0);
  assert.equal(result.data.items.length, 1);
});

test("ranking API restores prepared Chinese directly from disk without upstream or model calls", async (t) => {
  const f = await fixture(t, {
    defaults: [{ id: "ranking", query: rankingQuery() }],
  });
  for (let i = 0; i < 3; i++) await f.library.tick();
  for (const [name, value] of f.summaries) {
    const key = `card-${createHash("sha256").update(name.toLowerCase()).digest("hex")}`;
    await f.store.update(key, () => ({ card: value }));
  }
  const fail = () => {
    throw new Error("cached ranking must not wait for upstream or generation");
  };
  const service = createObservatory(
    { DISCOVERY_BACKGROUND: "on" },
    {
      store: f.store,
      github: fail,
      model: { configured: true, name: "fixture", json: fail },
    },
  );
  let status, result;
  await service.handle(
    { method: "GET", url: "/api/observatory/trends" },
    {
      setHeader() {},
      writeHead: (value) => (status = value),
      end: (value) => (result = JSON.parse(value)),
    },
  );
  assert.equal(status, 200);
  assert.equal(result.data.prepared, true);
  assert.equal(result.data.pending_count, 0);
  assert.deepEqual(
    result.data.repositories.map((r) => r.full_name),
    ["test/web-1", "test/web-2", "test/web-3"],
  );
  assert.equal(Object.keys(result.data.cards).length, 3);
});

test("partially prepared rankings show progress without assigning false positions or daily snapshots", async (t) => {
  const f = await fixture(t, {
    defaults: [{ id: "ranking", query: rankingQuery() }],
  });
  f.cards.prepare = async () => ({ cards: {}, errors: { missing: "failure" } });
  for (let i = 0; i < 3; i++) await f.library.tick();
  const fail = () => {
    throw new Error("must read prepared progress");
  };
  const service = createObservatory(
    { DISCOVERY_BACKGROUND: "on" },
    {
      store: f.store,
      github: fail,
      model: { configured: true, name: "fixture", json: fail },
    },
  );
  let result;
  await service.handle(
    { method: "GET", url: "/api/observatory/trends" },
    {
      setHeader() {},
      writeHead() {},
      end: (value) => (result = JSON.parse(value)),
    },
  );
  assert.equal(result.data.pending_count, 3);
  assert.deepEqual(result.data.repositories, []);
  assert.equal(await f.store.read("star-history"), null);
});

test("GitHub handler validates queries before entering server library and leaves repository reads unchanged", async () => {
  let libraryCalls = 0,
    upstreamCalls = 0;
  const options = {
    library: {
      enabled: true,
      search: async () => {
        libraryCalls++;
        return { data: { prepared: true } };
      },
    },
    github: async () => {
      upstreamCalls++;
      return { data: {} };
    },
  };
  const run = async (url) => {
    let status, body;
    await handleGitHubRequest(
      { url, method: "GET" },
      {
        setHeader() {},
        writeHead: (value) => (status = value),
        end: (value) => (body = JSON.parse(value)),
      },
      options,
    );
    return { status, body };
  };
  assert.equal((await run("/api/github/search?q=valid&page=0")).status, 400);
  assert.equal(libraryCalls, 0);
  assert.equal(
    (await run("/api/github/search?q=valid")).body.data.prepared,
    true,
  );
  assert.equal(libraryCalls, 1);
  assert.equal((await run("/api/github/repos/test/project")).status, 200);
  assert.equal(upstreamCalls, 1);
});

test("invalid registry entries do not prevent other categories from starting", async (t) => {
  const f = await fixture(t);
  await f.store.update("discovery-library", () => ({
    scopes: [
      { q: "bad", sort: "invalid" },
      { q: "valid", sort: "stars", pages: 1 },
    ],
  }));
  const status = await f.library.status();
  assert.equal(status.scopes.length, 3);
  await assert.rejects(f.library.search({ q: "x", page: 100 }), GitHubError);
});

test("manual scope updates preserve disk pages, exclude other scopes and respect failure cooldowns", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 6; i++) await f.library.tick();
  const requests = f.calls.length;
  let result = await f.library.requestRefresh({
    q: "topic:database",
    sort: "stars",
  });
  assert.equal(result.queued, 3);
  assert.equal(f.calls.length, requests);
  const before = await f.library.search({ q: "topic:database" });
  assert.equal(before.data.items.length, 1);
  for (let i = 0; i < 3; i++) await f.library.tick();
  const status = await f.library.status();
  assert.ok(status.scopes[0].prepared.every((page) => page.nextAt > 0));
  await assert.rejects(
    f.library.requestRefresh({ q: "unregistered", sort: "stars" }),
    (error) => error.status === 404,
  );
  f.advance(31 * 60_000);
  const failed = createDiscoveryLibrary({
    ...f.config,
    github: () => {
      throw new GitHubError(
        "cooldown",
        429,
        new Date(
          Date.parse("2026-11-01T00:00:00Z") + 120 * 60_000,
        ).toISOString(),
      );
    },
  });
  await failed.tick();
  result = await failed.requestRefresh({
    q: "topic:web-application",
    sort: "stars",
  });
  assert.equal(result.deferred, 1);
  assert.equal(result.queued, 2);
});

test("pausing background is immediate, finishes the active page, and resumes remaining work", async (t) => {
  const f = await fixture(t);
  let finish;
  const original = f.cards.prepare;
  f.cards.prepare = async (...args) => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    return original(...args);
  };
  await f.library.start();
  for (let i = 0; !finish && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 3));
  assert.ok(finish);
  assert.equal(f.library.pause().finishingCurrent, true);
  assert.equal((await f.library.status()).running, false);
  const done = f.library.stop();
  finish();
  await done;
  assert.equal(f.preparations.length, 1);
  f.cards.prepare = original;
  await f.library.start();
  assert.equal((await f.library.status()).running, true);
  await f.library.stop();
});

test("unseen language and sort combinations filter durable Chinese immediately while upstream is unavailable", async (t) => {
  const rows = [
    {
      ...repo("python-old"),
      language: "Python",
      stargazers_count: 20,
      pushed_at: "2025-01-01",
    },
    {
      ...repo("python-new"),
      language: "Python",
      stargazers_count: 10,
      pushed_at: "2026-11-01",
    },
    { ...repo("other"), language: "Go", stargazers_count: 50 },
  ];
  const f = await fixture(t, {
    defaults: [categories[0]],
    github: async () => envelope({ items: rows, total_count: 3 }, Date.now()),
  });
  await f.library.tick();
  let external = 0;
  const restored = createDiscoveryLibrary({
    ...f.config,
    github: async () => {
      external++;
      throw new Error("offline");
    },
    cards: {
      cached() {
        throw new Error("no generation on read");
      },
    },
  });
  const result = await restored.search({
    q: "is:public language:Python",
    sort: "updated",
  });
  assert.equal(result.data.filter_preview, true);
  assert.equal(result.data.total_count, 2);
  assert.deepEqual(
    result.data.items.map((r) => r.full_name),
    ["test/python-new", "test/python-old"],
  );
  assert.equal(Object.keys(result.data.cards).length, 2);
  assert.equal(external, 0);
  const category = await restored.search({
    q: "topic:web-application language:Python",
    sort: "stars",
  });
  assert.equal(category.data.total_count, 2);
  assert.equal(category.data.items[0].full_name, "test/python-old");
  await restored.stop();
});

test("a selected filter gets a separate deduplicated foreground preparation while unattended work is blocked", async (t) => {
  const f = await fixture(t, { defaults: [categories[0]] });
  for (let i = 0; i < 3; i++) await f.library.tick();
  f.advance(31 * 60_000);
  let release,
    backgroundStarted,
    foreground = 0;
  let releaseForeground;
  const foregroundGate = new Promise((resolve) => {
    releaseForeground = resolve;
  });
  const started = new Promise((resolve) => {
    backgroundStarted = resolve;
  });
  const original = f.cards.prepare;
  const service = createDiscoveryLibrary({
    ...f.config,
    github: async (path) => {
      if (!path.includes("language%3AGo")) return f.github(path);
      f.calls.push(path);
      return envelope(
        { items: [{ ...repo("selected"), language: "Go" }], total_count: 1 },
        Date.now(),
      );
    },
    cards: {
      ...f.cards,
      prepare: async (repos, options) => {
        if (options.priority < 0) {
          backgroundStarted();
          await new Promise((resolve) => {
            release = resolve;
          });
        } else {
          foreground++;
          await foregroundGate;
        }
        return original(repos, options);
      },
    },
  });
  await service.start();
  await started;
  try {
    for (let i = 0; i < 3; i++) {
      const preview = await service.search({ q: "language:Go", sort: "stars" });
      assert.equal(preview.data.filter_preview, true);
      assert.equal(preview.data.refresh_pending, true);
      assert.equal(preview.data.total_count, 0);
    }
    for (let i = 0; !foreground && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 3));
    assert.equal(foreground, 1);
    assert.equal(
      f.calls.filter((path) =>
        new URL(path, "http://local").searchParams
          .get("q")
          .includes("language:Go"),
      ).length,
      1,
    );
  } finally {
    service.pause();
    release();
    releaseForeground();
    await service.stop();
  }
});
