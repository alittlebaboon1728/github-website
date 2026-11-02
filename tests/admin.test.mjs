import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../server/storage.mjs";
import {
  createAdminHandler,
  isLocalAdminRequest,
  routeAdminPage,
} from "../server/admin.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "observatory-admin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createStore(directory);
  let running = true,
    refreshes = 0;
  const library = {
    enabled: true,
    status: async () => ({
      enabled: true,
      running,
      current: null,
      scopes: [],
      refreshMs: 1800_000,
    }),
    pause: () => {
      running = false;
      return { finishingCurrent: true };
    },
    start: async () => {
      running = true;
    },
    requestRefresh: async (scope) => {
      refreshes++;
      return { queued: scope ? 3 : 21, deferred: 0, running };
    },
  };
  const model = {
    configured: true,
    name: "fixture-model",
    apiKey: "never-expose-key",
    json() {
      throw new Error("admin reads must not call model");
    },
  };
  const handler = createAdminHandler({
    library,
    store,
    model,
    trialModel: model,
  });
  const server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    directory,
    store,
    library,
    handler,
    base: `http://127.0.0.1:${server.address().port}/api/admin`,
    refreshes: () => refreshes,
  };
}

test("admin status reads real disk statistics and exposes only model names and configured flags", async (t) => {
  const f = await fixture(t);
  await f.store.update(`card-${"a".repeat(64)}`, () => ({
    card: { summary: "中文" },
  }));
  await f.store.update(`discovery-page-${"b".repeat(64)}-1`, () => ({
    complete: true,
  }));
  await f.store.update("project-trials", () => ({
    "sample/notebook": { repo: "sample/notebook" },
  }));
  await writeFile(
    join(f.directory, "unrelated.txt"),
    "not part of application cache",
  );
  const response = await fetch(`${f.base}/status`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.data.storage.cards, 1);
  assert.equal(body.data.storage.pages, 1);
  assert.equal(body.data.storage.trials, 1);
  assert.equal(body.data.storage.files, 3);
  assert.ok(body.data.storage.bytes > 0);
  assert.equal(body.data.models.cards.name, "fixture-model");
  assert.equal(JSON.stringify(body).includes("never-expose-key"), false);
  assert.equal(f.refreshes(), 0);
});

test("valid local admin commands pause, resume and queue individual scopes without deleting cached files", async (t) => {
  const f = await fixture(t);
  const token = (await (await fetch(`${f.base}/status`)).json()).data.token;
  const post = async (body) => {
    const response = await fetch(`${f.base}/library`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": token,
        Origin: new URL(f.base).origin,
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 202);
    return (await response.json()).data;
  };
  assert.equal((await post({ action: "pause" })).finishingCurrent, true);
  assert.equal((await f.library.status()).running, false);
  assert.equal((await post({ action: "resume" })).running, true);
  assert.equal(
    (
      await post({
        action: "refresh",
        scope: { q: "topic:database", sort: "stars" },
      })
    ).queued,
    3,
  );
  assert.equal((await post({ action: "refresh" })).queued, 21);
  assert.equal(f.refreshes(), 2);
});

test("maintenance operations reject missing tokens, cross-site requests, unsupported actions, huge and malformed bodies", async (t) => {
  const f = await fixture(t);
  const token = (await (await fetch(`${f.base}/status`)).json()).data.token;
  const headers = {
    "Content-Type": "application/json",
    "X-Admin-Token": token,
  };
  const request = (body, extra = {}) =>
    fetch(`${f.base}/library`, {
      method: "POST",
      headers: { ...headers, ...extra },
      body,
    });
  assert.equal(
    (await request('{"action":"pause"}', { "X-Admin-Token": "" })).status,
    403,
  );
  assert.equal(
    (await request('{"action":"pause"}', { Origin: "https://other.example" }))
      .status,
    403,
  );
  assert.equal(
    (await request('{"action":"pause"}', { "Sec-Fetch-Site": "cross-site" }))
      .status,
    403,
  );
  assert.equal((await request("broken json")).status, 400);
  assert.equal((await request('{"action":"delete-cache"}')).status, 400);
  assert.equal(
    (await request('{"action":"refresh","scope":{"q":12}}')).status,
    400,
  );
  assert.equal((await request("a".repeat(2100))).status, 413);
  assert.equal((await fetch(`${f.base}/library`)).status, 405);
  assert.equal(f.refreshes(), 0);
  assert.equal((await f.library.status()).running, true);
});

test("admin endpoints and HTML require a loopback peer and local Host; forwarded addresses do not grant access", async (t) => {
  const f = await fixture(t);
  for (const [peer, host, expected] of [
    ["127.0.0.1", "localhost:4173", true],
    ["::1", "[::1]:4173", true],
    ["::ffff:127.0.0.1", "127.0.0.1:4173", true],
    ["10.0.0.2", "localhost:4173", false],
    ["127.0.0.1", "other.example:4173", false],
    ["127.0.0.1", "10.0.0.2:4173", false],
  ])
    assert.equal(
      isLocalAdminRequest({
        socket: { remoteAddress: peer },
        headers: { host, "x-forwarded-for": "127.0.0.1" },
      }),
      expected,
    );
  let status, result;
  const req = Readable.from([]);
  Object.assign(req, {
    url: "/api/admin/status",
    method: "GET",
    socket: { remoteAddress: "10.0.0.2" },
    headers: { host: "localhost:4173", "x-forwarded-for": "127.0.0.1" },
  });
  await f.handler(req, {
    setHeader() {},
    writeHead: (value) => (status = value),
    end: (value) => (result = JSON.parse(value)),
  });
  assert.equal(status, 403);
  assert.equal(result.data, undefined);
  const res = {
    setHeader() {},
    writeHead: (value) => (status = value),
    end() {},
  };
  assert.equal(routeAdminPage(req, res), false);
  req.url = "/admin";
  assert.equal(routeAdminPage(req, res), true);
  assert.equal(status, 403);
  req.socket.remoteAddress = "127.0.0.1";
  assert.equal(routeAdminPage(req, res), false);
  assert.equal(req.url, "/admin.html");
  req.socket.remoteAddress = "10.0.0.2";
  for (const path of ["/%61dmin.html", "/folder%5c..%5cadmin.html", "/%2fadmin.html"]) {
    req.url = path;
    assert.equal(routeAdminPage(req, res), true);
    assert.equal(status, 403);
  }
});

test("unconfigured library rejects maintenance rather than reporting a successful resume", async (t) => {
  const f = await fixture(t);
  f.library.enabled = false;
  const token = (await (await fetch(`${f.base}/status`)).json()).data.token;
  const response = await fetch(`${f.base}/library`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": token },
    body: JSON.stringify({ action: "resume" }),
  });
  assert.equal(response.status, 503);
});
