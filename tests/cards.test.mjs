import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  createCardService,
  validateCard,
  readPublicReadme,
  readmeFromHtml,
} from "../server/cards.mjs";
import { createStore } from "../server/storage.mjs";
import { createModelClient } from "../server/recommend.mjs";
import { createObservatory } from "../server/observatory.mjs";
import { createServer } from "node:http";

const description =
  "This project lets people write, search and export personal notes on their device.";
function value() {
  return {
    title: "在自己的设备整理个人笔记",
    category: "笔记工具",
    summary:
      "这个项目帮助你在自己的设备上编写、搜索和导出个人笔记。你可以用它记录想法，再用搜索找到相关内容，将需要的笔记导出留存。",
    audience: "需要整理个人笔记的人",
    evidence: description,
    features: [
      {
        title: "搜索个人笔记",
        text: "在自己的笔记中查找内容。",
        quote: description,
      },
    ],
    start: "先阅读项目 README，确认安装方法和支持的平台。",
    limitation: "具体平台支持和同步方式仍需核对。",
    visual: {
      layout: "flow",
      palette: "forest",
      caption: "从记录到找回想法",
      nodes: [
        { label: "写下想法", detail: "编写个人笔记", icon: "file" },
        { label: "搜索笔记", detail: "找到相关内容", icon: "search" },
        { label: "导出内容", detail: "保存需要的笔记", icon: "book" },
      ],
    },
  };
}
const repo = (index) => ({
  id: index,
  name: `notes-${index}`,
  full_name: `test/notes-${index}`,
  owner: { login: "test" },
  description,
  private: false,
  pushed_at: "2026-10-31",
  topics: ["notes"],
});
test("background preparation shares foreground generation and stale Chinese remains readable from disk", async (t) => {
  const store = await fixture(t);
  let calls = 0, finish;
  const model = {
    configured: true, name: "fixture",
    async json(_system, _input, options) {
      calls++;
      assert.equal(options.priority, -10);
      await new Promise((resolve) => { finish = resolve; });
      return value();
    },
  };
  const github = async () => ({ data: { content: description }, fetchedAt: new Date().toISOString() });
  const service = createCardService({ store, model, github });
  const preparation = service.prepare([repo(1)]);
  for (let i = 0; !finish && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  const foreground = service.startRanking([repo(1)]);
  finish();
  const prepared = await preparation;
  await finished(service, foreground.id);
  assert.equal(calls, 1);
  assert.equal(Object.keys(prepared.cards).length, 1);
  const key = `card-${createHash("sha256").update(repo(1).full_name.toLowerCase()).digest("hex")}`;
  await store.update(key, (saved) => ({ ...saved, card: { ...saved.card, generatedAt: "2020-01-01" } }));
  const recreated = createCardService({ store, model: { configured: true, json() { throw new Error("read should not call model"); } }, github });
  const cached = await recreated.cached([repo(1), { ...repo(2), private: true }]);
  assert.equal(cached[repo(1).full_name].generatedAt, "2020-01-01");
  assert.equal(Object.keys(cached).length, 1);
});
async function finished(service, id) {
  for (let i = 0; i < 500; i++) {
    const job = service.get(id);
    if (job.state !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not complete");
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "cards-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return createStore(dir);
}
test("cards require Chinese summaries, bounded diagrams and quotes present in their actual source", () => {
  const document = {
    kind: "readme",
    text: description,
    fetchedAt: "2026-10-31",
  };
  const valid = validateCard(value(), repo(1), document, "test-model");
  assert.equal(valid.fullName, "test/notes-1");
  assert.equal(valid.visual.nodes.length, 3);
  assert.equal(valid.sourceUrl, "https://github.com/test/notes-1#readme");
  assert.throws(() =>
    validateCard(
      { ...value(), evidence: "Invented source quote that never existed" },
      repo(1),
      document,
      "test-model",
    ),
  );
  assert.throws(() =>
    validateCard(
      { ...value(), summary: "Only English content" },
      repo(1),
      document,
      "test-model",
    ),
  );
  assert.throws(() =>
    validateCard(
      { ...value(), visual: { nodes: [] } },
      repo(1),
      document,
      "test-model",
    ),
  );
});

test("raw README failure reads only GitHub's rendered README article without spending REST quota", async () => {
  let rest = 0;
  const result = await readPublicReadme(
    { ...repo(1), default_branch: "main" },
    () => {
      rest++;
      throw new Error("limited");
    },
    async (url) => {
      if (url.startsWith("https://raw.githubusercontent.com/"))
        throw new Error("unavailable");
      return new Response(
        '<script>outside</script><article class="markdown-body entry-content"><p>作者说明 &amp; 真实用途。</p><script>doNotExecute()</script><p>学习&#x4e2d;文。</p></article><p>not README</p>',
      );
    },
  );
  assert.equal(rest, 0);
  assert.ok(result.data.content.includes("作者说明 & 真实用途。"));
  assert.ok(result.data.content.includes("学习中文。"));
  assert.ok(!result.data.content.includes("outside"));
  assert.ok(!result.data.content.includes("doNotExecute"));
  assert.ok(!result.data.content.includes("not README"));
  assert.equal(
    readmeFromHtml('<article class="other">not the readme</article>'),
    "",
  );
});
test("first three pages are queued once, concurrency is bounded, later pages require demand and persisted cards survive service recreation", async (t) => {
  const store = await fixture(t);
  const searches = [];
  let calls = 0,
    active = 0,
    peak = 0;
  const github = async (path) => {
    if (path.endsWith("/readme"))
      return { data: { content: description }, fetchedAt: "2026-10-31" };
    const page = Number(
      new URL(path, "http://localhost").searchParams.get("page"),
    );
    searches.push(page);
    return {
      data: {
        items: Array.from({ length: 12 }, (_, i) =>
          repo((page - 1) * 12 + i + 1),
        ),
        total_count: 60,
      },
      fetchedAt: "2026-10-31",
    };
  };
  const model = {
    configured: true,
    name: "fixture-flash",
    async json() {
      calls++;
      active++;
      peak = Math.max(active, peak);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return value();
    },
  };
  const service = createCardService({ github, model, store });
  const job = service.start({ q: "is:public", page: 1, count: 3 });
  assert.equal(job.state, "running");
  assert.equal(service.start({ q: "is:public", page: 1, count: 3 }).id, job.id);
  const ready = await finished(service, job.id);
  assert.equal(ready.state, "ready");
  assert.equal(
    ready.pages.flatMap((page) => Object.values(page.cards)).length,
    36,
  );
  assert.deepEqual(searches, [1, 2, 3]);
  assert.equal(calls, 36);
  assert.ok(peak <= 2);
  await finished(
    service,
    service.start({ q: "is:public", page: 4, count: 1 }).id,
  );
  assert.deepEqual(searches, [1, 2, 3, 4]);
  assert.equal(calls, 48);
  const recreated = createCardService({ github, model, store });
  await finished(
    recreated,
    recreated.start({ q: "is:public", page: 1, count: 3 }).id,
  );
  assert.equal(calls, 48);
});
test("individual failures remain visible and retries only regenerate missing cards; empty result pages never call the model", async (t) => {
  const store = await fixture(t);
  let fail = true,
    calls = 0;
  const github = async (path) => ({
    data: path.endsWith("/readme")
      ? { content: description }
      : { items: [repo(1), repo(2)], total_count: 2 },
    fetchedAt: "2026-10-31",
  });
  const model = {
    configured: true,
    name: "fixture",
    async json(_system, input) {
      calls++;
      if (fail && input.repository.fullName.endsWith("2"))
        throw new Error("upstream error");
      return value();
    },
  };
  const service = createCardService({ github, model, store });
  const partial = await finished(
    service,
    service.start({ q: "notes", page: 1, count: 3 }).id,
  );
  assert.equal(partial.state, "partial");
  assert.equal(Object.keys(partial.pages[0].cards).length, 1);
  assert.ok(partial.pages[0].errors["test/notes-2"]);
  assert.equal(partial.pages[1].state, "skipped");
  fail = false;
  assert.equal(
    (
      await finished(
        service,
        service.start({ q: "notes", page: 1, count: 1 }).id,
      )
    ).state,
    "ready",
  );
  assert.equal(calls, 3);
  const empty = createCardService({
    store,
    model,
    github: async () => ({ data: { items: [], total_count: 0 } }),
  });
  assert.equal(
    (await finished(empty, empty.start({ q: "nothing", page: 1, count: 3 }).id))
      .state,
    "ready",
  );
  assert.equal(calls, 3);
  assert.throws(() => service.start({ q: "notes", page: 2, count: 3 }));
  assert.throws(() => service.start({ q: "notes", page: 85, count: 1 }));
});
test("model transport sends selected model and server-only bearer credentials with JSON output", async () => {
  let request;
  const model = createModelClient(
    {
      AI_BASE_URL: "https://api.deepseek.com/v1",
      AI_API_KEY: "test-secret",
      AI_MODEL: "deepseek-flash",
      AI_THINKING: "disabled",
    },
    async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        }),
      );
    },
  );
  assert.deepEqual(
    await model.json("system", { task: "卡片" }, { maxTokens: 3500 }),
    { ok: true },
  );
  assert.equal(request.url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer test-secret");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.max_tokens, 3500);
  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("ranking summaries preserve the exact supplied order and reuse discovery and persistent card caches", async (t) => {
  const store = await fixture(t);
  let searches = 0,
    calls = 0;
  const github = async (path) => {
    if (path.endsWith("/readme")) return { data: { content: description } };
    searches++;
    return {
      data: { items: [repo(1), repo(2)], total_count: 2 },
      fetchedAt: new Date().toISOString(),
    };
  };
  const model = {
    configured: true,
    name: "fixture",
    async json() {
      calls++;
      return value();
    },
  };
  const service = createCardService({ github, model, store });
  await finished(service, service.start({ q: "notes", page: 1, count: 1 }).id);
  const ranking = service.startRanking([repo(2), repo(1)]);
  assert.equal(service.startRanking([repo(2), repo(1)]).id, ranking.id);
  const ready = await finished(service, ranking.id);
  assert.deepEqual(
    ready.pages[0].items.map((r) => r.full_name),
    ["test/notes-2", "test/notes-1"],
  );
  assert.equal(calls, 2);
  assert.equal(searches, 1);
  await finished(service, service.startRanking([repo(2), repo(1), repo(3)]).id);
  assert.equal(calls, 3);
  const restarted = createCardService({ github, model, store });
  await finished(restarted, restarted.startRanking([repo(3), repo(1)]).id);
  assert.equal(calls, 3);
  assert.throws(() => service.startRanking([{ ...repo(1), private: true }]));
  assert.throws(() =>
    service.startRanking(Array.from({ length: 31 }, (_, i) => repo(i))),
  );
});

test("ranking endpoint verifies names against the cached ranking and ignores untrusted repository metadata", async (t) => {
  const store = await fixture(t);
  let searches = 0,
    calls = 0;
  const app = createObservatory(
    {},
    {
      store,
      github: async (path) => {
        assert.ok(path.startsWith("/search/repositories?"));
        searches++;
        return {
          data: { items: [repo(1), repo(2)], total_count: 2 },
          fetchedAt: new Date().toISOString(),
        };
      },
      readme: async () => ({ data: { content: description } }),
      model: {
        configured: true,
        name: "fixture",
        async json(_prompt, input) {
          calls++;
          assert.equal(input.repository.description, description);
          return value();
        },
      },
    },
  );
  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}/api/observatory`;
  assert.equal((await fetch(`${base}/trends`)).status, 200);
  const post = (body) =>
    fetch(`${base}/cards/ranking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await post({ repositories: ["evil/outside"] })).status, 409);
  assert.equal(
    (
      await post({
        repositories: [{ full_name: "test/notes-1", private: false }],
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const response = await post({
    repositories: ["test/notes-2"],
    description: "untrusted",
    private: false,
  });
  assert.equal(response.status, 202);
  const job = (await response.json()).data;
  let result;
  for (let i = 0; i < 50; i++) {
    result = (await (await fetch(`${base}/cards/jobs/${job.id}`)).json()).data;
    if (result.state !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(result.state, "ready");
  assert.deepEqual(Object.keys(result.pages[0].cards), ["test/notes-2"]);
  assert.equal(searches, 1);
  assert.equal(calls, 1);
});

test("cached summaries and all search pages are available while unrelated model work is blocked", async (t) => {
  const store = await fixture(t);
  const model = {
    configured: true,
    name: "fixture",
    json: async () => value(),
  };
  const github = async (path) => {
    if (path.endsWith("/readme")) return { data: { content: description } };
    const page = Number(
      new URL(path, "http://fixture").searchParams.get("page"),
    );
    return {
      data: {
        items: Array.from({ length: 12 }, (_, i) => repo(page * 12 + i)),
        total_count: 100,
      },
    };
  };
  const warm = createCardService({ store, github, model });
  await finished(warm, warm.startRanking([repo(1)]).id);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const service = createCardService({
    store,
    github,
    concurrency: 1,
    model: {
      ...model,
      json: async () => {
        calls++;
        await blocked;
        return value();
      },
    },
  });
  t.after(release);
  const discovery = service.start({ q: "notes", count: 3 });
  for (
    let i = 0;
    i < 100 && !service.get(discovery.id).pages.every((p) => p.items.length);
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(
    service.get(discovery.id).pages.flatMap((p) => p.items).length,
    36,
  );
  assert.equal(service.get(discovery.id).state, "running");
  const cached = await finished(service, service.startRanking([repo(1)]).id);
  assert.equal(cached.state, "ready");
  assert.equal(calls, 1);
  release();
  await finished(service, discovery.id);
});
