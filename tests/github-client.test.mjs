import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleGitHubRequest } from "../server/github.mjs";
import { createObservatory } from "../server/observatory.mjs";
import { createGitHubClient, retryTime } from "../server/github-client.mjs";
import {
  parseRepositorySearch,
  parsePublicRepository,
} from "../server/github-public.mjs";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
const html = (text, status = 200) =>
  new Response(text, { status, headers: { "content-type": "text/html" } });
const embedded = (payload) =>
  `<script type="application/json">${JSON.stringify({ payload }).replace(/</g, "\\u003c")}</script>`;
const repo = (id = 1) => ({
  id,
  full_name: `sample/repo-${id}`,
  name: `repo-${id}`,
  private: false,
  owner: { login: "sample", avatar_url: "https://github.com/sample.png" },
  description: "A useful open source tool",
  language: "TypeScript",
  topics: ["tools"],
  stargazers_count: 1000 - id,
  forks_count: 12,
  open_issues_count: 3,
  pushed_at: "2026-10-30T00:00:00Z",
  created_at: "2020-01-01T00:00:00Z",
  default_branch: "main",
  html_url: `https://github.com/sample/repo-${id}`,
  archived: false,
});
function searchPage(page, total = 42) {
  return embedded({
    blackbirdSearchRoute: {
      type: "repositories",
      page,
      result_count: total,
      errors: [],
      results: Array.from(
        {
          length: Math.max(
            0,
            Math.min(10, Math.min(total, 1000) - (page - 1) * 10),
          ),
        },
        (_, i) => {
          const r = repo((page - 1) * 10 + i + 1);
          return {
            public: true,
            archived: false,
            followers: r.stargazers_count,
            language: r.language,
            topics: r.topics,
            hl_trunc_description: "A <em>useful</em> &amp; public tool",
            repo: {
              repository: {
                id: r.id,
                name: r.name,
                owner_login: r.owner.login,
                updated_at: r.pushed_at,
              },
            },
          };
        },
      ),
    },
  });
}
function repositoryPage({
  name = "sample/repo-1",
  isPublic = true,
  readmePath = "README.md",
} = {}) {
  const [owner, repoName] = name.split("/");
  return (
    `<meta name="octolytics-dimension-repository_public" content="${isPublic}"><meta name="octolytics-dimension-repository_nwo" content="${name}">` +
    embedded({
      codeViewLayoutRoute: {
        repo: {
          id: 1,
          name: repoName,
          ownerLogin: owner,
          public: isPublic,
          private: !isPublic,
          defaultBranch: "main",
          createdAt: "2020-01-01T00:00:00Z",
        },
      },
      sidebarAbout: {
        description: "A public tool",
        stargazerCount: 123,
        forksCount: 12,
        topics: [{ name: "tools" }],
        repo: { license: { spdxId: "MIT" } },
      },
      codeViewRepoRoute: {
        overview: {
          overviewFiles: [
            {
              preferredFileType: "readme",
              path: readmePath,
              richText:
                '<article class="markdown-body"><h1>Project README</h1><p>Actual public documentation.</p><script>malicious()</script></article>',
            },
          ],
        },
      },
    })
  );
}
function store() {
  const values = new Map();
  return {
    enabled: true,
    async read(key) {
      return structuredClone(values.get(key) ?? null);
    },
    async update(key, transform) {
      const value = transform(structuredClone(values.get(key)));
      values.set(key, structuredClone(value));
      return value;
    },
  };
}
function client(options = {}) {
  return createGitHubClient({
    searchInterval: 0,
    webInterval: 0,
    wait: async () => {},
    ...options,
  });
}
const query = (page = 1, q = "tools", size = 12) =>
  `/search/repositories?${new URLSearchParams({ q, page: String(page), per_page: String(size), sort: "stars" })}`;

test("public page parsers verify identity, strip search markup and leave unavailable fields unknown", () => {
  const data = parseRepositorySearch(searchPage(1), 1);
  assert.equal(data.items[0].description, "A useful & public tool");
  assert.equal(data.items[0].forks_count, null);
  assert.equal(data.items[0].pushed_at, null); // updated_at is not a push timestamp
  assert.equal(
    parsePublicRepository(repositoryPage(), "sample/repo-1").data
      .stargazers_count,
    123,
  );
  assert.throws(() =>
    parsePublicRepository(repositoryPage({ isPublic: false }), "sample/repo-1"),
  );
  assert.throws(() => parsePublicRepository(repositoryPage(), "other/repo"));
  assert.throws(() => parseRepositorySearch("<h1>Please sign in</h1>", 1));
  assert.throws(() => parseRepositorySearch(searchPage(1), 2));
});

test("three 12-item pages coalesce into one REST request; next page fetches the next batch", async () => {
  const calls = [];
  const github = client({
    fetchImpl: async (target, options) => {
      const url = new URL(target);
      calls.push(url);
      assert.equal(options.redirect, "error");
      if (url.hostname === "raw.githubusercontent.com")
        return new Response("# Readme\nA real public document.");
      assert.equal(url.searchParams.get("per_page"), "36");
      assert.equal(url.searchParams.get("q"), "tools is:public");
      const page = Number(url.searchParams.get("page"));
      return json({
        total_count: 100,
        incomplete_results: false,
        items: Array.from({ length: 36 }, (_, i) =>
          repo((page - 1) * 36 + i + 1),
        ),
      });
    },
  });
  const pages = await Promise.all([
    github(query(1)),
    github(query(2)),
    github(query(3)),
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    pages.map((p) => p.data.items[0].id),
    [1, 13, 25],
  );
  assert.equal((await github(query(4))).data.items[0].id, 37);
  assert.equal(calls.length, 2);
  await github("/repos/sample/repo-1");
  const document = await github("/repos/sample/repo-1/readme");
  assert.equal(document.provider, "github-raw");
  assert.equal(calls.length, 3); // metadata from the search, no redundant REST detail request
});

test("REST limit falls back to public search with exact 10-to-12 pagination, shared HTML and no credentials", async () => {
  const calls = [];
  const github = client({
    token: "server-only",
    fetchImpl: async (target, options) => {
      const url = new URL(target);
      calls.push(url);
      if (url.hostname === "api.github.com") {
        if (url.pathname.startsWith("/repos/")) return json(repo());
        return json({}, 429, { "retry-after": "60" });
      }
      assert.equal(url.hostname, "github.com");
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(
        url.searchParams.get("q"),
        "topic:tools language:TypeScript is:public",
      );
      assert.equal(url.searchParams.get("s"), "stars");
      return html(searchPage(Number(url.searchParams.get("p"))));
    },
  });
  const results = [];
  for (let p = 1; p <= 3; p++)
    results.push(await github(query(p, "topic:tools language:TypeScript")));
  assert.deepEqual(
    results.flatMap((r) => r.data.items.map((i) => i.id)),
    Array.from({ length: 36 }, (_, i) => i + 1),
  );
  assert.equal(calls.filter((u) => u.hostname === "api.github.com").length, 1);
  assert.equal(calls.filter((u) => u.hostname === "github.com").length, 4);
  assert.equal(results[0].provider, "github-web");
  assert.match(results[0].warning, /公开网页/);
  const ranking = await github(query(1, "topic:tools language:TypeScript", 30));
  assert.equal(ranking.data.items.length, 30);
  assert.deepEqual(
    ranking.data.items.map((r) => r.id),
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  assert.equal((await github("/repos/sample/repo-1")).data.id, 1); // core quota is independent
});

test("web search keeps the final partial page at GitHub's 1000-result boundary", async () => {
  const github = client({
    fetchImpl: async (target) =>
      new URL(target).hostname === "api.github.com"
        ? json({}, 429)
        : html(searchPage(100, 10000)),
  });
  const result = await github(query(84));
  assert.deepEqual(
    result.data.items.map((r) => r.id),
    [997, 998, 999, 1000],
  );
});

test("invalid searches and missing/private repositories do not trigger scraping or stale substitutions", async () => {
  for (const response of [() => json({}, 404), () => json({ private: true })]) {
    const calls = [];
    const github = client({
      fetchImpl: async (target) => {
        calls.push(target);
        return response();
      },
    });
    await assert.rejects(
      github("/repos/sample/repo-1/readme"),
      (e) => e.status === 404,
    );
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0]).hostname, "api.github.com");
  }
  let calls = 0;
  const github = client({
    fetchImpl: async () => {
      calls++;
      return json({}, 422);
    },
  });
  await assert.rejects(github(query()), (e) => e.status === 422);
  assert.equal(calls, 1);
  await assert.rejects(github(query(85)), (e) => e.status === 400);
  await assert.rejects(github("https://evil.example"), (e) => e.status === 400);
  assert.equal(calls, 1);
});

test("raw README is shared across cards and reading, persisted, bounded and never sent credentials", async () => {
  const disk = store();
  let calls = 0;
  const github = client({
    store: disk,
    token: "secret",
    fetchImpl: async (target, options) => {
      calls++;
      assert.equal(new URL(target).hostname, "raw.githubusercontent.com");
      assert.equal(options.headers?.Authorization, undefined);
      return new Response("字".repeat(180010));
    },
  });
  const r = await github.readPublicReadme(repo());
  assert.equal(r.data.truncated, true);
  assert.equal(r.data.content.length, 180000);
  const recreated = client({
    store: disk,
    fetchImpl: async () => {
      throw Error("should not fetch");
    },
  });
  const cached = await recreated("/repos/sample/repo-1/readme");
  assert.equal(cached.fetchedAt, r.fetchedAt);
  assert.equal(cached.source, "cache");
  assert.equal(calls, 1);
});

test("REST and raw failures use verified HTML README including its actual nested path", async () => {
  const calls = [];
  const github = client({
    fetchImpl: async (target) => {
      const url = new URL(target);
      calls.push(url);
      if (url.hostname === "api.github.com") return json({}, 429);
      if (url.hostname === "raw.githubusercontent.com")
        return new Response("", { status: 404 });
      return html(repositoryPage({ readmePath: "docs/README.md" }));
    },
  });
  const r = await github("/repos/sample/repo-1/readme");
  assert.equal(r.provider, "github-web");
  assert.equal(r.data.path, "docs/README.md");
  assert.match(r.data.content, /Actual public documentation/);
  assert.doesNotMatch(r.data.content, /malicious/);
  assert.equal(calls.filter((u) => u.hostname === "github.com").length, 1);
  assert.equal(calls.filter((u) => u.hostname === "api.github.com").length, 1);
});

test("exact-query stale fallback preserves original timestamp across restart and cannot leak into another query", async () => {
  let time = Date.parse("2026-11-01T00:00:00Z");
  const disk = store();
  const github = client({
    store: disk,
    now: () => time,
    fetchImpl: async () => json({ total_count: 1, items: [repo()] }),
  });
  const original = await github(query());
  time += 11 * 60_000;
  const offline = client({
    store: disk,
    now: () => time,
    fetchImpl: async () => {
      throw Error("offline");
    },
  });
  const stale = await offline(query());
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, original.fetchedAt);
  assert.equal(stale.source, "cache");
  assert.match(stale.warning, /此前保存/);
  await assert.rejects(
    offline(query(1, "a different query")),
    (e) => e.status === 502,
  );
  time += 8 * 86400_000;
  const expired = client({
    store: disk,
    now: () => time,
    fetchImpl: async () => {
      throw Error("offline");
    },
  });
  await assert.rejects(expired(query()), (e) => e.status === 502);
});

test("a newly confirmed 404 invalidates cached repository and README instead of serving old public data", async () => {
  let time = Date.parse("2026-11-01T00:00:00Z"),
    missing = false;
  const disk = store();
  const github = client({
    store: disk,
    now: () => time,
    fetchImpl: async (target) => {
      if (missing) return json({}, 404);
      return new URL(target).hostname === "raw.githubusercontent.com"
        ? new Response("# A public project README")
        : json(repo());
    },
  });
  await github("/repos/sample/repo-1/readme");
  time += 61 * 60_000;
  missing = true;
  await assert.rejects(github("/repos/sample/repo-1"), (e) => e.status === 404);
  await assert.rejects(
    github("/repos/sample/repo-1/readme"),
    (e) => e.status === 404,
  );
  const saved = await disk.read("github-response-cache");
  assert.equal(saved["/repos/sample/repo-1/readme"], undefined);
});

test("search requests are paced and HTTP-date Retry-After produces a finite cooldown", async () => {
  let time = Date.parse("2026-11-01T00:00:00Z");
  const starts = [];
  const github = createGitHubClient({
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
    fetchImpl: async () => {
      starts.push(time);
      return json({ total_count: 0, items: [] });
    },
  });
  await Promise.all([
    github(query(1, "one")),
    github(query(1, "two")),
    github(query(1, "three")),
  ]);
  assert.deepEqual(
    starts.map((at) => at - starts[0]),
    [0, 6100, 12200],
  );
  assert.equal(
    retryTime(
      new Headers({ "retry-after": new Date(time + 120_000).toUTCString() }),
      time,
    ),
    Math.floor((time + 120_000) / 1000) * 1000,
  );
  assert.equal(
    retryTime(
      new Headers({ "retry-after": "invalid", "x-ratelimit-reset": "invalid" }),
      time,
    ),
    time + 60_000,
  );
});

test("a different search can return public HTML during REST spacing, while warm batches stay cached", async () => {
  let rest = 0,
    web = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const github = createGitHubClient({
    webInterval: 0,
    wait: () => gate,
    fetchImpl: async (target) => {
      const url = new URL(target);
      if (url.hostname === "api.github.com") {
        rest++;
        return json({
          total_count: 36,
          items: Array.from({ length: 36 }, (_, i) => repo(i + 1)),
        });
      }
      web++;
      return html(searchPage(Number(url.searchParams.get("p"))));
    },
  });
  await github(query(1, "first"));
  assert.equal((await github(query(1, "second"))).provider, "github-web");
  assert.equal(
    (await github(query(2, "first"))).data.items[0].full_name,
    "sample/repo-13",
  );
  assert.equal(rest, 1);
  assert.equal(web, 2);
  release();
});

test("an unavailable public search never holds a ready REST response behind its timeout", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const github = createGitHubClient({
    wait: async () => {},
    webInterval: 0,
    fetchImpl: async (target) => {
      if (new URL(target).hostname === "api.github.com")
        return json({ total_count: 1, items: [repo()] });
      await gate;
      return html(searchPage(1, 1));
    },
  });
  await github(query(1, "first"));
  const next = await github(query(1, "second"));
  release();
  assert.equal(next.provider, "github-api");
});

test("slow raw README requests overlap within a bounded lane and coalesce duplicates", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let active = 0,
    peak = 0,
    calls = 0;
  const github = client({
    fetchImpl: async () => {
      calls++;
      peak = Math.max(peak, ++active);
      await gate;
      active--;
      return new Response("Actual public documentation.");
    },
  });
  const requests = [1, 2, 3, 1].map((id) => github.readPublicReadme(repo(id)));
  for (let i = 0; i < 30 && calls < 3; i++)
    await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all(requests);
  assert.equal(calls, 3);
  assert.equal(peak, 3);
});

test("search and web cooldowns survive service recreation without probing blocked hosts again", async () => {
  let calls = 0;
  const disk = store();
  const fetchImpl = async () => {
    calls++;
    return json({}, 429, { "retry-after": "120" });
  };
  await assert.rejects(
    client({ store: disk, fetchImpl })(query()),
    (e) => e.status === 429,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    client({ store: disk, fetchImpl })(query()),
    (e) => e.status === 429,
  );
  assert.equal(calls, 2);
});

test("HTTP proxy and observatory share the resilient client and expose fallback provenance", async (t) => {
  let restCalls = 0;
  const app = createObservatory(
    { OBSERVATORY_PERSISTENCE: "off" },
    {
      store: store(),
      fetchImpl: async (target) => {
        const url = new URL(target);
        if (url.hostname === "api.github.com") {
          restCalls++;
          return json({}, 429);
        }
        return html(searchPage(Number(url.searchParams.get("p"))));
      },
    },
  );
  const server = createServer(async (req, res) => {
    if (await app.handle(req, res)) return;
    await handleGitHubRequest(req, res, { github: app.github });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/github/search?q=tools`,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.provider, "github-web");
  assert.equal(result.data.items.length, 12);
  const shared = await app.github(
    "/search/repositories?q=tools%20is%3Apublic&page=1&per_page=12&order=desc&sort=stars",
  );
  assert.equal(shared.source, "cache");
  assert.equal(restCalls, 1);
});
