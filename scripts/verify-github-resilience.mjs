// Live public-source smoke check. Simulated REST 429s do not consume REST quota.
// This never calls the model or reads credentials.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createGitHubClient } from "../server/github-client.mjs";

const calls = [];
const live = createGitHubClient({
  fetchImpl: async (target, options) => {
    let response;
    try {
      response = await fetch(target, options);
    } catch (error) {
      calls.push({
        host: new URL(target).hostname,
        path: new URL(target).pathname,
        status: null,
        error: error.message,
      });
      throw error;
    }
    calls.push({
      path: new URL(target).pathname,
      host: new URL(target).hostname,
      status: response.status,
    });
    return response;
  },
});
const path = (page) =>
  `/search/repositories?${new URLSearchParams({ q: "whiteboard language:TypeScript is:public", sort: "stars", per_page: "12", page: String(page) })}`;
const normal = await Promise.all([1, 2, 3].map((page) => live(path(page))));
assert.equal(normal[0].data.items.length, 12);
assert.equal(
  new Set(normal.flatMap((page) => page.data.items.map((r) => r.id))).size,
  36,
);
const fallbackCalls = [];
const fallback = createGitHubClient({
  fetchImpl: async (target, options) => {
    const url = new URL(target);
    if (url.hostname === "api.github.com") {
      fallbackCalls.push({
        host: url.hostname,
        path: url.pathname,
        status: 429,
        simulated: true,
      });
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "60" },
      });
    }
    let response;
    try {
      response = await fetch(target, options);
    } catch (error) {
      fallbackCalls.push({
        host: url.hostname,
        path: url.pathname,
        status: null,
        error: error.message,
      });
      throw error;
    }
    fallbackCalls.push({
      host: url.hostname,
      path: url.pathname,
      status: response.status,
    });
    return response;
  },
});
const search = await fallback(path(1));
assert.equal(search.provider, "github-web");
assert.equal(search.data.items.length, 12);
assert(
  search.data.items.every((r) => r.private === false && r.forks_count === null),
);
const metadata = await fallback("/repos/excalidraw/excalidraw");
assert.equal(metadata.data.full_name, "excalidraw/excalidraw");
const document = await fallback("/repos/excalidraw/excalidraw/readme");
assert(document.data.content.length > 100);
const cache = await fallback(path(1));
assert.equal(cache.source, "cache");
const report = {
  checkedAt: new Date().toISOString(),
  normal: {
    providers: normal.map((r) => r.provider),
    items: normal.map((r) => r.data.items.length),
    requests: calls,
  },
  fallback: {
    provider: search.provider,
    items: search.data.items.length,
    total: search.data.total_count,
    repository: metadata.data.full_name,
    readmeProvider: document.provider,
    readmeCharacters: document.data.content.length,
    requests: fallbackCalls,
  },
};
await mkdir(".build", { recursive: true });
await writeFile(
  ".build/github-resilience-live.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
