import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { normalizeEvents } from "../server/activity.mjs";
import { normalizePulse, pulseData } from "../server/pulse.mjs";
import { createCache, createStore } from "../server/storage.mjs";
import {
  calculateGrowth,
  rankingQuery,
  recordSnapshot,
} from "../server/trends.mjs";
import {
  createModelClient,
  normalizePlan,
  recommend,
  validateConversation,
  verifySelections,
} from "../server/recommend.mjs";
import { createObservatory } from "../server/observatory.mjs";

async function temporaryStore(t) {
  const dir = await mkdtemp(join(tmpdir(), "observatory-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { store: createStore(dir), dir };
}
const repo = {
  id: 1001,
  private: false,
  archived: false,
  full_name: "org/notes",
  name: "notes",
  default_branch: "main",
  stargazers_count: 100,
  description: "Personal offline notes",
};
const readme =
  "A personal note taking application. Works offline on Windows and Linux. Requires manual server deployment for sync.";
const plan = {
  summary: "找离线个人笔记",
  constraints: [
    { id: "purpose", label: "个人笔记", level: "must" },
    { id: "offline", label: "离线", level: "must" },
    { id: "windows", label: "Windows", level: "prefer" },
  ],
  queries: ["notes offline", "personal notebook"],
};
const selection = {
  fullName: repo.full_name,
  purpose: "个人离线笔记",
  reason: "README 说明可以离线使用",
  evidence: "A personal note taking application.",
  checks: [
    {
      id: "purpose",
      status: "met",
      quote: "A personal note taking application.",
    },
    {
      id: "offline",
      status: "met",
      quote: "Works offline on Windows and Linux.",
    },
    {
      id: "windows",
      status: "met",
      quote: "Works offline on Windows and Linux.",
    },
  ],
  limitations: [
    {
      text: "同步需要手工部署服务",
      quote: "Requires manual server deployment for sync.",
      unknown: false,
    },
  ],
};

test("activity exposes only supported, traceable public events and preserves event time", () => {
  const base = {
    repo: { name: "org/tool" },
    created_at: "2026-10-30T00:00:00Z",
  };
  const events = normalizeEvents([
    {
      ...base,
      id: "1",
      type: "ReleaseEvent",
      payload: {
        action: "published",
        release: {
          tag_name: "v1",
          html_url: "https://github.com/org/tool/releases/tag/v1",
        },
      },
    },
    {
      ...base,
      id: "2",
      type: "PullRequestEvent",
      payload: {
        action: "closed",
        pull_request: {
          merged: false,
          html_url: "https://github.com/org/tool/pull/1",
        },
      },
    },
    {
      ...base,
      id: "3",
      type: "PullRequestEvent",
      payload: {
        action: "closed",
        pull_request: {
          merged: true,
          title: "Fix",
          html_url: "https://github.com/org/tool/pull/2",
        },
      },
    },
    {
      ...base,
      id: "4",
      type: "IssuesEvent",
      payload: {
        action: "opened",
        issue: { html_url: "https://evil.com/issue" },
      },
    },
    { ...base, id: "5", type: "PushEvent", payload: {} },
    {
      ...base,
      id: "6",
      type: "CreateEvent",
      payload: { ref_type: "repository" },
    },
    {
      ...base,
      id: "7",
      type: "PullRequestEvent",
      payload: {
        action: "merged",
        number: 3,
        pull_request: { url: "https://api.github.com/repos/org/tool/pulls/3" },
      },
    },
    {
      ...base,
      id: "8",
      type: "PushEvent",
      payload: { ref: "refs/heads/main", head: "a".repeat(40) },
    },
  ]);
  assert.deepEqual(
    events.map((e) => e.id),
    ["1", "3", "6", "7", "8"],
  );
  assert.equal(events[0].occurredAt, base.created_at);
  assert.equal(events[0].text, "发布 v1");
  assert.equal(events[3].url, "https://github.com/org/tool/pull/3");
  assert.equal(
    events[4].url,
    `https://github.com/org/tool/commit/${"a".repeat(40)}`,
  );
});

test("pulse normalizes UTC, preserves exact PR links and counts only valid source intervals", () => {
  const row = {
    id: 1,
    repo_name: "org/repo",
    type: "PullRequestEvent",
    action: "merged",
    number: 42,
    created_at: "2026-10-31 13:50:33",
  };
  const data = normalizePulse(
    [
      row,
      row,
      { ...row, id: 2, repo_name: "../../evil" },
      { ...row, id: 3, number: -1 },
      { ...row, id: 4, created_at: "bad" },
    ],
    [
      { cnt: 25, latest_created_at: "2026-10-31 13:50:35" },
      { cnt: -1, latest_created_at: row.created_at },
      { cnt: null, latest_created_at: row.created_at },
      { cnt: 20, latest_created_at: "bad" },
    ],
  );
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].url, "https://github.com/org/repo/pull/42");
  assert.equal(data.events[0].occurredAt, "2026-10-31T13:50:33.000Z");
  assert.equal(data.events[0].text, "合并 PR #42");
  assert.deepEqual(data.bars, [{ at: "2026-10-31T13:50:35.000Z", count: 25 }]);
});

test("pulse survives upstream failure through persistent cache, then GitHub fallback without fake chart", async (t) => {
  const { store, dir } = await temporaryStore(t);
  const offline = async () => {
    throw new Error("offline");
  };
  const github = async () => ({
    data: [],
    source: "live",
    fetchedAt: "2026-10-31T00:00:00Z",
  });
  const live = await pulseData(github, store, async (url, options) => {
    assert.ok(options.signal);
    assert.ok(url.startsWith("https://ossinsight.io/api/q/"));
    return Response.json({
      data: url.endsWith("list")
        ? [
            {
              id: 1,
              repo_name: "org/repo",
              type: "PushEvent",
              created_at: "2026-10-31 13:50:33",
            },
          ]
        : [{ cnt: 25, latest_created_at: "2026-10-31 13:50:35" }],
    });
  });
  assert.equal(live.source, "live");
  const cached = await pulseData(github, createStore(dir), offline);
  assert.equal(cached.data.stale, true);
  assert.deepEqual(cached.data.bars, live.data.bars);
  const fallback = await pulseData(github, createStore(dir, false), offline);
  assert.equal(fallback.data.provider, "GitHub");
  assert.deepEqual(fallback.data.bars, []);
});

test("cache coalesces concurrent loads and retains failure recovery", async () => {
  const cached = createCache();
  let calls = 0;
  const load = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return { data: calls, source: "live" };
  };
  await Promise.all([cached("one", 1000, load), cached("one", 1000, load)]);
  assert.equal(calls, 1);
  assert.equal((await cached("one", 1000, load)).source, "cache");
  await assert.rejects(
    cached("two", 1000, async () => {
      throw new Error("offline");
    }),
  );
  assert.equal((await cached("two", 1000, load)).data, 2);
});

test("persistent snapshots write once per UTC day and isolate identical query scopes", async (t) => {
  const { store, dir } = await temporaryStore(t);
  await Promise.all([
    recordSnapshot(store, "scope", [repo], "2026-10-20T12:00:00Z"),
    recordSnapshot(
      store,
      "scope",
      [{ ...repo, stargazers_count: 120 }],
      "2026-10-20T18:00:00Z",
    ),
  ]);
  const history = await recordSnapshot(
    createStore(dir),
    "scope",
    [{ ...repo, stargazers_count: 95 }],
    "2026-10-27T12:00:00Z",
  );
  assert.equal(history.snapshots.length, 2);
  const growth = calculateGrowth(
    history.snapshots,
    [{ ...repo, stargazers_count: 95 }],
    7,
    Date.parse("2026-10-27T12:00:00Z"),
  );
  assert.equal(growth.ready, true);
  assert.equal(growth.items[0].delta, -5);
  assert.equal(growth.items[0].points.length, 2);
  assert.equal(
    calculateGrowth(
      history.snapshots,
      [{ ...repo, id: 1002 }],
      7,
      Date.parse("2026-10-27T12:00:00Z"),
    ).ready,
    false,
  );
  assert.equal(calculateGrowth(history.snapshots, [repo], 30).ready, false);
  assert.equal(
    (await recordSnapshot(store, "other-scope", [repo], "2026-10-27T12:00:00Z"))
      .snapshots.length,
    1,
  );
  assert.equal(
    (
      await recordSnapshot(
        createStore(dir, false),
        "scope",
        [repo],
        new Date().toISOString(),
      )
    ).enabled,
    false,
  );
  assert.match(
    rankingQuery({ kind: "new" }, new Date("2026-10-31")),
    /created:>=2026-10-01/,
  );
  assert.throws(() => rankingQuery({ language: "malicious syntax" }));
});

test("model protocol validates conversation and applies edited condition priority", () => {
  assert.throws(() => validateConversation({ turns: ["x".repeat(501)] }));
  assert.throws(() =>
    validateConversation({
      turns: ["notes"],
      overrides: [{ id: "bad", level: "whatever" }],
    }),
  );
  const updated = normalizePlan(plan, [
    { id: "offline", label: "离线", level: "prefer" },
    { id: "windows", label: "Windows", level: "remove" },
  ]);
  assert.equal(
    updated.constraints.find((c) => c.id === "offline").level,
    "prefer",
  );
  assert.equal(
    updated.constraints.some((c) => c.id === "windows"),
    false,
  );
});

test("AI verification excludes invented projects, unsupported claims and unconfirmed hard requirements", () => {
  const candidates = [
    {
      repo,
      readme,
      sourceUrl: "https://github.com/org/notes#readme",
      fetchedAt: new Date().toISOString(),
      source: "live",
    },
  ];
  assert.equal(
    verifySelections({ selections: [selection, selection] }, candidates, plan)
      .length,
    1,
  );
  assert.equal(
    verifySelections(
      { selections: [{ ...selection, fullName: "invented/repo" }] },
      candidates,
      plan,
    ).length,
    0,
  );
  assert.equal(
    verifySelections(
      {
        selections: [
          { ...selection, evidence: "Supports everything the user asked for." },
        ],
      },
      candidates,
      plan,
    ).length,
    0,
  );
  assert.equal(
    verifySelections(
      {
        selections: [
          {
            ...selection,
            checks: selection.checks.filter((c) => c.id !== "offline"),
          },
        ],
      },
      candidates,
      plan,
    ).length,
    0,
  );
  const fakeEvidence = {
    ...selection,
    checks: selection.checks.map((c) =>
      c.id === "offline"
        ? { ...c, quote: "Supports offline mode on all devices." }
        : c,
    ),
  };
  assert.equal(
    verifySelections({ selections: [fakeEvidence] }, candidates, plan).length,
    0,
  );
});

test("recommendation pipeline searches multiple queries, reads candidates, carries follow-up and verifies quotes", async () => {
  const paths = [];
  const progress = [];
  const model = {
    configured: true,
    async json(system, body) {
      if (system.includes("不推荐具体仓库")) {
        assert.deepEqual(body.turns, ["推荐离线笔记", "只看 Windows"]);
        return plan;
      }
      assert.equal(body.candidates[0].readme, readme);
      return {
        selections: [selection, { ...selection, fullName: "fiction/notes" }],
      };
    },
  };
  const github = async (path) => {
    paths.push(path);
    return {
      data: path.endsWith("/readme")
        ? { content: readme, path: "README.md" }
        : { items: [repo] },
      source: "live",
      fetchedAt: "2026-10-31T00:00:00Z",
    };
  };
  const result = await recommend(
    { turns: ["推荐离线笔记", "只看 Windows"], overrides: [] },
    { github, model, progress: (stage) => progress.push(stage) },
  );
  assert.equal(
    paths.filter((p) => p.startsWith("/search/repositories?")).length,
    2,
  );
  assert.equal(paths.filter((p) => p.endsWith("/readme")).length, 1);
  assert.equal(result.selections.length, 1);
  assert.deepEqual(progress, ["parse", "search", "read", "verify"]);
  await assert.rejects(
    recommend(
      { turns: ["离线笔记"], overrides: [] },
      { github, model: { configured: false } },
    ),
    (e) => e.status === 503,
  );
});

test("HTTP endpoints expose honest unconfigured AI status, reject writes and keep keys server-side", async (t) => {
  const { store } = await temporaryStore(t);
  const app = createObservatory(
    {},
    {
      store,
      github: async () => ({
        data: [],
        source: "live",
        fetchedAt: "2026-10-31T00:00:00Z",
      }),
    },
  );
  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/observatory`;
  const status = await (await fetch(`${base}/status`)).json();
  assert.equal((await fetch(`${base}/blogs`)).status, 404);
  assert.equal(status.data.aiConfigured, false);
  assert.equal(
    (
      await fetch(`${base}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: ["notes"] }),
      })
    ).status,
    503,
  );
  assert.equal(
    (await fetch(`${base}/activity`, { method: "DELETE" })).status,
    405,
  );
  assert.equal(createModelClient({ AI_API_KEY: "secret" }).configured, false);
  assert.equal(JSON.stringify(status).includes("secret"), false);
});
