// Explicit live smoke: one new Chinese card and one recommendation (up to 11
// model requests plus a possible card repair). Run only when live use is intended.
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { createObservatory } from "../server/observatory.mjs";
import { createModelClient } from "../server/recommend.mjs";
import { createStore } from "../server/storage.mjs";
import { handleGitHubRequest } from "../server/github.mjs";

const model = createModelClient(process.env);
if (!model.configured)
  throw new Error("Configure the server model before live verification.");
const calls = [];
const upstream = [];
const app = createObservatory(process.env, {
  store: createStore(".build/search-speed-live", false),
  fetchImpl: async (target, options) => {
    const url = new URL(target),
      start = performance.now();
    const record = {
      host: url.hostname,
      path: url.pathname,
      q: url.searchParams.get("q"),
    };
    try {
      const response = await fetch(target, options);
      record.status = response.status;
      return response;
    } catch (error) {
      record.error = error.name;
      throw error;
    } finally {
      record.ms = Math.round(performance.now() - start);
      upstream.push(record);
      console.log("upstream", JSON.stringify(record));
    }
  },
  model: {
    configured: true,
    name: model.name,
    async json(system, input, options) {
      const start = performance.now();
      const value = await model.json(system, input, options);
      const record = {
        kind: input.sourceSegments
          ? "card"
          : input.candidates
            ? "verify"
            : "plan",
        ms: Math.round(performance.now() - start),
      };
      calls.push(record);
      console.log(JSON.stringify(record));
      return value;
    },
  },
});
const server = createServer(async (req, res) => {
  if (await app.handle(req, res)) return;
  if (await handleGitHubRequest(req, res, { github: app.github })) return;
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = {
  at: new Date().toISOString(),
  model: model.name,
  calls,
  upstream,
};
const post = (path, body) =>
  fetch(`${base}/api/observatory${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
try {
  const query = "repo:markedjs/marked is:public";
  for (const name of ["coldSearch", "warmSearch"]) {
    const start = performance.now();
    const result = await app.github(
      `/search/repositories?${new URLSearchParams({ q: query, per_page: "12", page: "1", sort: "stars" })}`,
    );
    report[name] = {
      ms: Math.round(performance.now() - start),
      count: result.data.items.length,
      provider: result.provider,
      source: result.source,
    };
    console.log(name, JSON.stringify(report[name]));
  }
  const startCard = performance.now();
  const response = await post("/cards/pages", { q: query, page: 1, count: 1 });
  const started = await response.json();
  if (!response.ok) throw new Error(started.error);
  let job = started.data;
  while (job.state === "running" && performance.now() - startCard < 200000) {
    await delay(100);
    job = (
      await (await fetch(`${base}/api/observatory/cards/jobs/${job.id}`)).json()
    ).data;
  }
  const card = job.pages[0].cards["markedjs/marked"];
  report.card = {
    ms: Math.round(performance.now() - startCard),
    state: job.state,
    summary: card?.summary,
    errors: job.pages[0].errors,
    error: job.pages[0].error,
  };
  console.log("card", JSON.stringify(report.card));
  const body = {
    turns: ["推荐能把 Markdown 转成 HTML 的 JavaScript 开源库"],
    overrides: [],
  };
  for (const name of ["aiSearch", "warmAiSearch"]) {
    const start = performance.now();
    const response = await post("/recommend", body);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let pending = "",
      firstMs,
      result;
    for (;;) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.type === "error" || event.error) throw new Error(event.error);
        if (event.type === "progress") console.log(event.message);
        if (
          ["partial", "result"].includes(event.type) &&
          event.data.selections.length
        )
          firstMs ??= Math.round(performance.now() - start);
        if (event.type === "result") result = event;
      }
      if (done) break;
    }
    report[name] = {
      firstMs,
      totalMs: Math.round(performance.now() - start),
      source: result?.source,
      projects: result?.data.selections.map((s) => s.repo.full_name),
      warning: result?.data.warning,
    };
    console.log(name, JSON.stringify(report[name]));
  }
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await mkdir(".build", { recursive: true });
  await writeFile(
    ".build/search-speed-live.json",
    JSON.stringify(report, null, 2),
  );
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
