import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGitHubPath,
  getGitHubData,
  GitHubError,
} from "../server/github.mjs";

const url = (path) => new URL(path, "http://localhost");
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });

test("search forces public scope, validates query, pagination and sort", () => {
  const result = new URL(
    buildGitHubPath(url("/api/github/search?q=whiteboard&page=2&sort=updated")),
    "https://api.github.com",
  );
  assert.equal(result.pathname, "/search/repositories");
  assert.equal(result.searchParams.get("q"), "whiteboard is:public");
  assert.equal(result.searchParams.get("page"), "2");
  assert.equal(result.searchParams.get("per_page"), "12");
  assert.equal(result.searchParams.get("sort"), "updated");
  assert.equal(
    new URL(
      buildGitHubPath(url("/api/github/search?q=test&sort=best-match")),
      "https://api.github.com",
    ).searchParams.has("sort"),
    false,
  );
  for (const path of [
    "/search?q=%20",
    "/search?page=0",
    "/search?page=85",
    "/search?sort=bogus",
    `/search?q=${"a".repeat(501)}`,
  ])
    assert.throws(
      () => buildGitHubPath(url(`/api/github${path}`)),
      GitHubError,
    );
});

test("only recognized GitHub endpoints and repository identifiers are allowed", () => {
  assert.equal(
    buildGitHubPath(url("/api/github/repos/excalidraw/excalidraw/readme")),
    "/repos/excalidraw/excalidraw/readme",
  );
  for (const path of [
    "/api/github/https://evil.com",
    "/api/github/repos/o/r/extra",
    "/api/github/repos/o/%2e%2e",
    "/api/github/repos/o/r%2Fx",
  ])
    assert.throws(() => buildGitHubPath(url(path)), GitHubError);
});

test("concurrent calls coalesce, then use cache without another GitHub request", async () => {
  let count = 0;
  const fetchImpl = async (target, options) => {
    count++;
    assert.equal(target, "https://api.github.com/repos/test/cache-case");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer server-only-secret");
    await new Promise((resolve) => setTimeout(resolve, 15));
    return json({ private: false, name: "cache-case" });
  };
  const results = await Promise.all([
    getGitHubData("/repos/test/cache-case", {
      fetchImpl,
      token: "server-only-secret",
    }),
    getGitHubData("/repos/test/cache-case", { fetchImpl }),
  ]);
  assert.equal(count, 1);
  assert.equal(results[0].source, "live");
  assert.equal(
    (await getGitHubData("/repos/test/cache-case", { fetchImpl })).source,
    "cache",
  );
  assert.equal(count, 1);
});

test("private repositories are rejected and never cached", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return json({ private: true });
  };
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      getGitHubData("/repos/test/private-case", { fetchImpl }),
      (e) => e.status === 404,
    );
  assert.equal(calls, 2);
});

test("README verifies repository visibility and decodes UTF-8 content", async () => {
  const calls = [];
  const fetchImpl = async (target) => {
    calls.push(target);
    return json(
      target.endsWith("/readme")
        ? {
            encoding: "base64",
            content: Buffer.from("# 中文项目\n说明").toString("base64"),
            path: "README.md",
          }
        : { private: false },
    );
  };
  const result = await getGitHubData("/repos/test/readme-case/readme", {
    fetchImpl,
  });
  assert.equal(calls.length, 2);
  assert.equal(result.data.content, "# 中文项目\n说明");
  assert.equal(result.data.encoding, "utf-8");
  assert.equal(result.data.truncated, false);
});

test("README for private repository never requests file content", async () => {
  const calls = [];
  const fetchImpl = async (target) => {
    calls.push(target);
    return json({ private: true });
  };
  await assert.rejects(
    getGitHubData("/repos/test/private-readme/readme", { fetchImpl }),
    (e) => e.status === 404,
  );
  assert.equal(calls.length, 1);
});

test("rate limits preserve retry time; other upstream errors have useful responses", async () => {
  await assert.rejects(
    getGitHubData("/repos/test/rate-case", {
      fetchImpl: async () => json({}, 429, { "retry-after": "60" }),
    }),
    (e) => e.status === 429 && Date.parse(e.resetAt) > Date.now(),
  );
  await assert.rejects(
    getGitHubData("/repos/test/missing-case", {
      fetchImpl: async () => json({}, 404),
    }),
    (e) => e.status === 404,
  );
  await assert.rejects(
    getGitHubData("/search/repositories?q=invalid-case", {
      fetchImpl: async () => json({}, 422),
    }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    getGitHubData("/repos/test/offline-case", {
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    (e) => e.status === 502,
  );
});

test("large README is bounded and explicitly marked as truncated", async () => {
  const fetchImpl = async (target) =>
    json(
      target.endsWith("/readme")
        ? {
            encoding: "base64",
            content: Buffer.from("文".repeat(180010)).toString("base64"),
          }
        : { private: false },
    );
  const result = await getGitHubData("/repos/test/large-case/readme", {
    fetchImpl,
  });
  assert.equal(result.data.content.length, 180000);
  assert.equal(result.data.truncated, true);
});
