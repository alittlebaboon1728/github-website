import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTick } from "node:timers/promises";
import { createModelClient, recommend } from "../server/recommend.mjs";
import { createTrialModel } from "../server/trial-model.mjs";
import { createCardService } from "../server/cards.mjs";
import { createTrialService } from "../server/trials.mjs";
import { createStore } from "../server/storage.mjs";
import { GitHubError } from "../server/github.mjs";
import { content, document, repository } from "./fixtures/trials.mjs";

// Intercept the actual provider transport with fake credentials; no network or key files.
const dsConfig = {
  AI_BASE_URL: "https://ds.example/v1",
  AI_API_KEY: "test-only-ds",
  AI_MODEL: "deepseek-flash",
};
const gptConfig = {
  TRIAL_AI_BASE_URL: "https://gpt.example/v1",
  TRIAL_AI_API_KEY: "test-only-gpt",
  TRIAL_AI_MODEL: "gpt-6.1-sol",
};
const response = (value) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
const envelope = (data) => ({
  data,
  source: "cache",
  fetchedAt: "2026-11-01T00:00:00Z",
});
const store = () => createStore(".build/isolation-fixture-disabled", false);
async function finish(read) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await read();
    if ((value.job?.state || value.state) !== "running") return value;
    await nextTick();
  }
  assert.fail("fixture job did not finish");
}
function inputOf(body) {
  assert.deepEqual(
    body.messages.map((message) => message.role),
    ["system", "user"],
  );
  for (const key of [
    "conversation",
    "conversation_id",
    "thread_id",
    "previous_response_id",
    "history",
  ])
    assert.equal(Object.hasOwn(body, key), false);
  return JSON.parse(body.messages[1].content);
}

for (const [name, factory, config] of [
  ["DeepSeek", createModelClient, dsConfig],
  ["GPT", createTrialModel, gptConfig],
]) {
  test(`${name} transport isolates parallel projects and later requests without accumulating answers`, async () => {
    const sent = [];
    const model = factory(config, async (_url, options) => {
      const body = JSON.parse(options.body);
      const input = inputOf(body);
      sent.push(input);
      await nextTick();
      return response({ answer: `PRIVATE_REPLY_${input.repository}` });
    });
    const inputs = [
      { repository: "isolation/alpha", readme: "ALPHA_ONLY_README" },
      { repository: "isolation/beta", readme: "BETA_ONLY_README" },
      {
        repository: "isolation/alpha",
        readme: "ALPHA_ONLY_README",
        turns: ["新问题"],
      },
    ];
    await Promise.all(
      inputs
        .slice(0, 2)
        .map((input) => model.json("current project only", input)),
    );
    await model.json("current project only", inputs[2]);
    assert.deepEqual(sent, inputs);
    assert.equal(JSON.stringify(sent).includes("PRIVATE_REPLY_"), false);
  });
}

test("DeepSeek card jobs keep source, correction and caches separate across projects", async () => {
  const projects = ["alpha", "beta"].map((name, index) => ({
    ...repository,
    id: index + 1,
    full_name: `isolation/${name}`,
    name,
    description: `ONLY_${name.toUpperCase()}_SOURCE: A notebook for organizing and finding personal notes.`,
  }));
  const requests = [],
    reads = [];
  const model = createModelClient(dsConfig, async (_url, options) => {
    const input = inputOf(JSON.parse(options.body));
    requests.push(input);
    const current = projects.find(
      (repo) => repo.full_name === input.repository.fullName,
    );
    const other = projects.find((repo) => repo !== current);
    assert.equal(input.source, undefined); // source text travels only once
    assert.ok(
      input.sourceSegments.some((segment) =>
        segment.text.includes(current.description),
      ),
    );
    assert.equal(JSON.stringify(input).includes(other.description), false);
    if (current.name === "alpha" && !input.correction)
      return response({ invalid: "ALPHA_PRIVATE_REPAIR" });
    assert.equal(Boolean(input.correction), current.name === "alpha");
    return response({
      title: "记录并找回个人笔记",
      category: "笔记工具",
      summary: "将想法记录为笔记，并在需要时查找。",
      audience: "需要整理笔记的人",
      evidence: current.description,
      features: [
        {
          title: "查找笔记",
          text: "找到之前记录的内容。",
          quote: current.description,
        },
      ],
      start: "阅读项目说明后开始记录。",
      limitation: "同步能力需要核对。",
      visual: {
        caption: "记录与查找",
        nodes: ["写下想法", "查找笔记", "回顾内容"].map((label) => ({
          label,
          detail: "笔记内容",
          icon: "file",
        })),
      },
    });
  });
  const service = createCardService({
    model,
    store: store(),
    github: async (path) => {
      reads.push(path);
      return envelope({
        content: projects.find((repo) => path.includes(repo.full_name))
          .description,
      });
    },
  });
  const job = service.startRanking(projects);
  const completed = await finish(() => service.get(job.id));
  assert.equal(completed.state, "ready");
  assert.equal(requests.length, 3);
  assert.equal(reads.length, 2);
  const beta = requests.find((input) =>
    input.repository.fullName.endsWith("/beta"),
  );
  assert.equal(JSON.stringify(beta).includes("ALPHA_PRIVATE_REPAIR"), false);
  for (const repo of projects)
    assert.equal(
      completed.pages[0].cards[repo.full_name].fullName,
      repo.full_name,
    );
  await finish(() =>
    service.get(service.startRanking([...projects].reverse()).id),
  );
  assert.equal(requests.length, 3);
  assert.equal(reads.length, 2);
});

test("GPT trials isolate simultaneous README, repair attempts and saved results", async () => {
  const projects = ["alpha", "beta"].map((name, index) => ({
    ...repository,
    id: index + 1,
    name,
    full_name: `isolation/${name}`,
  }));
  const requests = [],
    reads = [];
  const model = createTrialModel(gptConfig, async (_url, options) => {
    const input = inputOf(JSON.parse(options.body));
    requests.push(input);
    const current = projects.find(
      (repo) => repo.full_name === input.repository.name,
    );
    const other = projects.find((repo) => repo !== current);
    assert.ok(
      input.readme.includes(`ONLY_${current.name.toUpperCase()}_SOURCE`),
    );
    assert.equal(
      JSON.stringify(input).includes(`ONLY_${other.name.toUpperCase()}_SOURCE`),
      false,
    );
    if (current.name === "alpha" && !input.correction) return response({});
    assert.equal(Boolean(input.correction), current.name === "alpha");
    return response(structuredClone(content));
  });
  const service = createTrialService({
    model,
    store: store(),
    github: async (path) =>
      envelope(projects.find((repo) => path === `/repos/${repo.full_name}`)),
    readme: async (repo) => {
      reads.push(repo.full_name);
      return {
        ...document,
        data: {
          ...document.data,
          content: `${document.data.content}\nONLY_${repo.name.toUpperCase()}_SOURCE`,
          html_url: `${repo.full_name}#readme`,
        },
      };
    },
  });
  await Promise.all(projects.map((repo) => service.start(repo.full_name)));
  for (const repo of projects) {
    const result = await finish(() => service.get(repo.full_name));
    assert.equal(result.job.state, "ready");
    assert.equal(result.trial.repo, repo.full_name);
  }
  assert.equal(requests.length, 3);
  assert.equal(reads.length, 2);
  await service.list();
  for (const repo of projects) await service.start(repo.full_name);
  assert.equal(requests.length, 3);
  assert.equal(reads.length, 2);
});

const plan = {
  summary: "寻找离线笔记",
  constraints: [{ id: "offline", level: "must", label: "离线使用" }],
  queries: ["notes offline", "personal notebook"],
};
function recommendationFixture(size = 10) {
  const repos = Array.from({ length: size }, (_, index) => ({
    ...repository,
    id: index,
    full_name: `isolation/notes-${index}`,
    archived: false,
    default_branch: "main",
    description: `ONLY_REPO_${index}_SOURCE`,
  }));
  const reads = [],
    queries = [];
  return {
    repos,
    reads,
    queries,
    github: async (path) => {
      if (path.startsWith("/search/")) {
        queries.push(path);
        return envelope({ items: repos });
      }
      reads.push(path);
      const repo = repos.find(
        (repo) => path === `/repos/${repo.full_name}/readme`,
      );
      return envelope({
        content: `${repo.description}\nWorks offline for organizing personal notes.`,
        path: "README.md",
      });
    },
  };
}
const choice = (fullName) => ({
  fullName,
  purpose: "离线笔记",
  reason: "原文说明可离线整理笔记。",
  evidence: "Works offline for organizing personal notes.",
  checks: [
    {
      id: "offline",
      status: "met",
      quote: "Works offline for organizing personal notes.",
    },
  ],
  limitations: [{ text: "同步方式待核对。", unknown: true }],
});

test("GitHub reads each README once while independent DeepSeek checks run; no source batch is sent to the model", async () => {
  const fixture = recommendationFixture();
  let active = 0,
    peak = 0;
  const verified = [];
  const model = createModelClient(dsConfig, async (_url, options) => {
    const input = inputOf(JSON.parse(options.body));
    if (input.turns) return response(plan);
    assert.equal(input.candidates.length, 1);
    const current = input.candidates[0];
    verified.push(current.fullName);
    for (const repo of fixture.repos)
      assert.equal(
        current.readme.includes(repo.description),
        repo.full_name === current.fullName,
      );
    peak = Math.max(peak, ++active);
    await nextTick();
    active--;
    // An unrelated result must fail validation even if the provider returns it.
    return response({
      selections: [choice(current.fullName), choice("foreign/unrequested")],
    });
  });
  const result = await recommend(
    { turns: ["我想找离线笔记"], overrides: [] },
    { github: fixture.github, model },
  );
  assert.equal(fixture.queries.length, 2);
  assert.equal(fixture.reads.length, 10);
  assert.equal(new Set(fixture.reads).size, 10);
  assert.deepEqual(
    verified,
    fixture.repos.map((repo) => repo.full_name),
  );
  assert.equal(peak, 4);
  assert.deepEqual(
    result.selections.map((item) => item.repo.full_name),
    verified.slice(0, 8),
  );
  assert.equal(result.verified, 10);
});

test("one failed DeepSeek project keeps other verified results without fetching GitHub again", async () => {
  const fixture = recommendationFixture(3);
  const model = {
    configured: true,
    json: async (_system, input) => {
      if (input.turns) return plan;
      const current = input.candidates[0];
      if (current.fullName.endsWith("-1"))
        throw new GitHubError("fixture rate limit", 429);
      return { selections: [choice(current.fullName)] };
    },
  };
  const result = await recommend(
    { turns: ["离线笔记"], overrides: [] },
    { github: fixture.github, model },
  );
  assert.deepEqual(
    result.selections.map((item) => item.repo.full_name),
    ["isolation/notes-0", "isolation/notes-2"],
  );
  assert.match(result.warning, /1 个项目/);
  assert.equal(fixture.reads.length, 3);
  await assert.rejects(
    recommend(
      { turns: ["离线笔记"], overrides: [] },
      {
        github: fixture.github,
        model: {
          configured: true,
          json: async (_system, input) => {
            if (input.turns) return plan;
            throw new GitHubError("fixture rate limit", 429);
          },
        },
      },
    ),
    (error) => error.status === 429,
  );
});
