import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { createModelClient, recommend } from "../server/recommend.mjs";
import { createRecommendationJobs } from "../server/recommend-jobs.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function until(predicate) {
  for (let i = 0; i < 200 && !predicate(); i++) await tick();
  assert.ok(predicate(), "expected progress before blocked work completes");
}

test("model queue gives interactive work priority and removes cancelled requests before transport", async () => {
  const starts = [],
    gates = [];
  const model = createModelClient(
    {
      AI_BASE_URL: "https://model.test/v1",
      AI_API_KEY: "fixture",
      AI_MODEL: "fixture",
      AI_CONCURRENCY: "1",
    },
    async (_url, options) => {
      starts.push(
        JSON.parse(JSON.parse(options.body).messages[1].content).name,
      );
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      return Response.json({ choices: [{ message: { content: "{}" } }] });
    },
  );
  const first = model.json("test", { name: "running" }, { priority: 0 });
  await until(() => starts.length === 1);
  const background = model.json(
    "test",
    { name: "background" },
    { priority: 0 },
  );
  const interactive = model.json("test", { name: "interactive" });
  const controller = new AbortController();
  const cancelled = assert.rejects(
    model.json("test", { name: "cancelled" }, { signal: controller.signal }),
    { name: "AbortError" },
  );
  controller.abort();
  gates[0].resolve();
  await until(() => starts.length === 2);
  assert.equal(starts[1], "interactive");
  gates[1].resolve();
  await until(() => starts.length === 3);
  gates[2].resolve();
  await Promise.all([first, background, interactive, cancelled]);
  assert.deepEqual(starts, ["running", "interactive", "background"]);
});

test("verified recommendations stream before a slow README finishes and retain deterministic final order", async () => {
  const slow = deferred(),
    updates = [],
    reads = [];
  const repos = [0, 1, 2].map((id) => ({
    id,
    full_name: `test/tool-${id}`,
    private: false,
    archived: false,
    default_branch: "main",
  }));
  const quote = "This project organizes and searches personal notes.";
  const operation = recommend(
    { turns: ["寻找笔记工具"], overrides: [] },
    {
      github: async (path) => {
        assert.ok(path.startsWith("/search/"));
        return { data: { items: repos } };
      },
      fetchReadme: async (repo) => {
        reads.push(repo.id);
        if (repo.id === 0) await slow.promise;
        return {
          data: { content: `${repo.full_name}\n${quote}`, path: "README.md" },
        };
      },
      partial: (value) => updates.push(value),
      model: {
        configured: true,
        json: async (_system, input) => {
          if (input.turns)
            return { summary: "寻找笔记", constraints: [], queries: ["notes"] };
          assert.equal(input.candidates.length, 1);
          return {
            selections: [
              {
                fullName: input.candidates[0].fullName,
                purpose: "记录笔记",
                reason: "可查找记录",
                evidence: quote,
              },
            ],
          };
        },
      },
    },
  );
  await until(() => updates.length > 0);
  assert.ok(updates[0].selections.every((s) => s.repo.id !== 0));
  assert.equal(updates[0].partial, true);
  slow.resolve();
  const final = await operation;
  assert.deepEqual(
    final.selections.map((s) => s.repo.id),
    [0, 1, 2],
  );
  assert.deepEqual(reads, [0, 1, 2]);
});

test("shared AI jobs replay progress, cancel only after the last subscriber, and cache without occupying active slots", async () => {
  const running = [];
  const subscribe = createRecommendationJobs(async (body, { signal, emit }) => {
    const gate = deferred();
    running.push({ body, gate, signal, emit });
    signal.addEventListener("abort", () => gate.resolve(), { once: true });
    emit({ type: "progress", message: "working" });
    await gate.promise;
    signal.throwIfAborted();
    return { data: body, source: "live" };
  });
  const body = { turns: ["first"] },
    events = [];
  const a = subscribe(body, () => {});
  await until(() => running.length === 1);
  const b = subscribe(body, (event) => events.push(event));
  assert.equal(events[0].message, "working");
  a.release();
  assert.equal(running[0].signal.aborted, false);
  running[0].gate.resolve();
  await Promise.all([a.promise, b.promise]);
  b.release();
  const c = subscribe({ turns: ["second"] }, () => {});
  const d = subscribe({ turns: ["third"] }, () => {});
  const cancelled = Promise.all([
    assert.rejects(c.promise, { name: "AbortError" }),
    assert.rejects(d.promise, { name: "AbortError" }),
  ]);
  await until(() => running.length === 3);
  assert.equal((await subscribe(body, () => {}).promise).source, "cache");
  assert.throws(
    () => subscribe({ turns: ["fourth"] }, () => {}),
    (error) => error.status === 429,
  );
  c.release();
  d.release();
  await cancelled;
  assert.ok(running.slice(1).every((job) => job.signal.aborted));
});

test("a slow second query does not delay recommendations from the first, and failed queries leave their budget available", async () => {
  const slow = deferred(),
    updates = [];
  const repos = Array.from({ length: 10 }, (_, id) => ({
    id,
    full_name: `test/project-${id}`,
    private: false,
    archived: false,
  }));
  const quote = "A project for writing and searching personal notes.";
  const operation = recommend(
    { turns: ["寻找笔记"], overrides: [] },
    {
      github: async (path) => {
        if (
          new URL(path, "http://test").searchParams.get("q").startsWith("slow")
        ) {
          await slow.promise;
          throw new Error("unavailable");
        }
        return { data: { items: repos } };
      },
      fetchReadme: async () => ({ data: { content: quote } }),
      partial: (update) => updates.push(update),
      model: {
        configured: true,
        json: async (_system, input) =>
          input.turns
            ? {
                summary: "寻找笔记",
                constraints: [],
                queries: ["notes", "slow"],
              }
            : {
                selections: [
                  {
                    fullName: input.candidates[0].fullName,
                    purpose: "记录笔记",
                    reason: "支持搜索",
                    evidence: quote,
                  },
                ],
              },
      },
    },
  );
  await until(() => updates.length === 5);
  assert.equal(updates.at(-1).selections.length, 5);
  slow.resolve();
  const result = await operation;
  assert.equal(result.verified, 10);
  assert.equal(result.selections.length, 8);
  assert.match(result.warning, /部分检索失败/);
});
