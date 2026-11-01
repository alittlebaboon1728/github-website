import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  recommend,
  validateConversation,
  conversationKey,
} from "../server/recommend.mjs";
import { createObservatory } from "../server/observatory.mjs";
import { readAnonymousProject } from "../server/project-readme.mjs";
import { GitHubError } from "../server/github.mjs";

const repo = {
  private: false,
  full_name: "org/notes",
  default_branch: "main",
  description: "Offline notes",
};
const readme =
  "Works offline on Windows and Linux. Synchronization requires manual server deployment.";
const envelope = (data) => ({
  data,
  fetchedAt: "2026-11-01T00:00:00Z",
  source: "live",
});
const body = {
  repo: "org/notes",
  turns: ["可以离线吗？", "支持什么系统？"],
  overrides: [],
};
const model = {
  configured: true,
  async json() {
    return {
      answer: "支持在 Windows 和 Linux 上离线使用。",
      quotes: ["Works offline on Windows and Linux."],
    };
  },
};

test("project questions use only the selected public repo, preserve follow-ups and cite actual README path", async () => {
  const paths = [],
    stages = [];
  const result = await recommend(body, {
    github: async (path) => {
      paths.push(path);
      return envelope(
        path.endsWith("/readme")
          ? { content: readme, path: "docs/README.en.md" }
          : repo,
      );
    },
    model: {
      ...model,
      async json(system, input) {
        assert.match(system, /中文/);
        assert.equal(input.repository, "org/notes");
        assert.deepEqual(input.turns, body.turns);
        assert.equal(input.readme, readme);
        return model.json();
      },
    },
    progress: (stage) => stages.push(stage),
  });
  assert.deepEqual(paths, ["/repos/org/notes", "/repos/org/notes/readme"]);
  assert.deepEqual(stages, ["read", "answer"]);
  assert.match(result.answer.text, /离线/);
  assert.equal(
    result.answer.sourceUrl,
    "https://github.com/org/notes/blob/main/docs/README.en.md",
  );
  assert.deepEqual(result.answer.quotes, [
    "Works offline on Windows and Linux.",
  ]);
  assert.equal(result.verified, 1);
  assert.deepEqual(result.selections, []);
});

test("project answers discard fabricated evidence and explain missing README without invoking a model", async () => {
  const github = async () => envelope(repo);
  const result = await recommend(body, {
    github,
    fetchReadme: async () => envelope({ content: readme }),
    model: {
      ...model,
      async json() {
        return {
          answer: "支持所有设备和自动同步。",
          quotes: ["Automatic sync on every device."],
        };
      },
    },
  });
  assert.match(result.answer.text, /没有足够/);
  assert.deepEqual(result.answer.quotes, []);
  const missing = await recommend(body, {
    github,
    fetchReadme: async () => {
      throw new Error("404");
    },
    model: {
      ...model,
      async json() {
        assert.fail("no model call without README");
      },
    },
  });
  assert.equal(missing.verified, 0);
  assert.match(missing.answer.text, /无法取得/);
  assert.equal(missing.answer.sourceUrl, "https://github.com/org/notes");
});

test("project mode verifies visibility and identity before reading documents", async () => {
  for (const data of [
    { ...repo, private: true },
    { ...repo, full_name: "other/project" },
  ])
    await assert.rejects(
      recommend(body, {
        github: async () => envelope(data),
        model,
        fetchReadme: async () =>
          assert.fail("unverified repo must not be read"),
      }),
      (error) => error.status === 400,
    );
});

test("project validation rejects malformed paths and cache keys isolate project scopes", () => {
  assert.deepEqual(validateConversation(body), body);
  for (const value of [
    "org/notes/readme",
    "../notes",
    "org/..",
    "https://github.com/org/notes",
    {},
    "a/" + "b".repeat(200),
  ])
    assert.throws(
      () => validateConversation({ ...body, repo: value }),
      (error) => error.status === 400,
    );
  assert.notEqual(
    conversationKey(body),
    conversationKey({ ...body, repo: "other/notes" }),
  );
  const ordinary = { turns: ["找笔记项目"], overrides: [] };
  assert.deepEqual(validateConversation(ordinary), ordinary);
});

test("GitHub quota failure can use anonymously readable README but missing/private repositories cannot bypass verification", async () => {
  const paths = [];
  const fetchAnonymousProject = (name) =>
    readAnonymousProject(name, async (url, options) => {
      paths.push(url);
      assert.equal(options.redirect, "error");
      assert.equal(options.headers, undefined);
      return new Response(readme);
    });
  const result = await recommend(body, {
    github: async () => {
      throw new GitHubError("quota", 429);
    },
    fetchAnonymousProject,
    model,
  });
  assert.equal(paths.length, 1);
  assert.equal(
    result.answer.sourceUrl,
    "https://github.com/org/notes/blob/HEAD/README.md",
  );
  assert.match(result.answer.text, /离线/);
  await assert.rejects(
    recommend(body, {
      github: async () => {
        throw new GitHubError("private or missing", 404);
      },
      fetchAnonymousProject: async () => assert.fail("404 must not fall back"),
      model,
    }),
    (error) => error.status === 404,
  );
  assert.equal(
    await readAnonymousProject(
      "org/notes",
      async () => new Response("missing", { status: 404 }),
    ),
    null,
  );
});

test("HTTP streaming project questions share the protected endpoint and cache by repository", async (t) => {
  let calls = 0;
  const app = createObservatory(
    { OBSERVATORY_PERSISTENCE: "off" },
    {
      github: async (path) =>
        envelope({ ...repo, full_name: path.slice("/repos/".length) }),
      readme: async () => envelope({ content: readme, path: "README.md" }),
      model: {
        ...model,
        async json() {
          calls++;
          return model.json();
        },
      },
    },
  );
  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (repoName) => {
    const response = await fetch(`${origin}/api/observatory/recommend`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, repo: repoName }),
    });
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    return events.find((event) => event.type === "result");
  };
  const first = await request("org/notes");
  assert.equal(first.data.answer.repo, "org/notes");
  await request("org/notes");
  assert.equal(calls, 1);
  const other = await request("other/notes");
  assert.equal(other.data.answer.repo, "other/notes");
  assert.equal(calls, 2);
});

test("anonymous HTML fallback requires matching public identity and extracts only the actual README", async () => {
  const html = (publicValue, name) =>
    `<meta name="octolytics-dimension-repository_public" content="${publicValue}"><meta name="octolytics-dimension-repository_nwo" content="${name}"><p>Navigation is not evidence</p><article class="markdown-body"><p>${readme}</p></article>`;
  const fetchPage = (value) => async (url) =>
    url.startsWith("https://github.com/")
      ? new Response(value)
      : new Response("missing", { status: 404 });
  const result = await readAnonymousProject(
    "org/notes",
    fetchPage(html("true", "org/notes")),
  );
  assert.equal(result.metadata.data.private, false);
  assert.equal(result.document.data.content, readme);
  assert.equal(result.document.data.path, undefined);
  assert.equal(
    await readAnonymousProject(
      "org/notes",
      fetchPage(html("false", "org/notes")),
    ),
    null,
  );
  assert.equal(
    await readAnonymousProject(
      "org/notes",
      fetchPage(html("true", "other/notes")),
    ),
    null,
  );
});
