import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreparedProjectIndex,
  parseDiscoveryFilter,
} from "../shared/discovery-filter.mjs";

function entry(name, language, stars, date, topics = []) {
  const repo = {
    full_name: `test/${name}`,
    private: false,
    language,
    stargazers_count: stars,
    pushed_at: date,
    topics,
  };
  return {
    repo,
    card: { fullName: repo.full_name, summary: "有公开来源的中文介绍。" },
  };
}
function seed(
  index,
  entries,
  query = "is:public",
  at = "2026-11-02T00:00:00Z",
) {
  index.ingest(query, {
    fetchedAt: at,
    data: {
      prepared: true,
      items: entries.map((e) => e.repo),
      cards: Object.fromEntries(entries.map((e) => [e.repo.full_name, e.card])),
    },
  });
}
test("local filters match exact languages and topics, preserve sort order and exclude unverified cards", () => {
  const index = createPreparedProjectIndex();
  const rows = [
    entry("cpp-old", "C++", 100, "2025-01-01", ["database"]),
    entry("cpp-new", "C++", 50, "2026-11-01", ["web-application"]),
    entry("c", "C", 1000, "2026-11-02"),
    entry("python", "Python", 500, null),
    entry("private", "C++", 9999, null),
    entry("english", "C++", 9999, null),
  ];
  rows[4].repo.private = true;
  rows[5].card.summary = "No Chinese summary";
  seed(index, rows);
  assert.deepEqual(
    index.search("is:public language:C++").items.map((e) => e.repo.full_name),
    ["test/cpp-old", "test/cpp-new"],
  );
  assert.deepEqual(
    index.search("language:C++", "updated").items.map((e) => e.repo.full_name),
    ["test/cpp-new", "test/cpp-old"],
  );
  assert.deepEqual(
    index
      .search("topic:database language:C++")
      .items.map((e) => e.repo.full_name),
    ["test/cpp-old"],
  );
  assert.equal(index.search("language:Java").total, 0);
  for (const q of [
    "awesome language:Python",
    "topic:database OR topic:design-tools",
    "stars:>1000",
    "topic:unknown",
    "language:Python language:Go",
  ])
    assert.equal(parseDiscoveryFilter(q), null);
});

test("cached query membership handles incomplete topic metadata and newer metadata controls sorting", () => {
  const index = createPreparedProjectIndex();
  const row = entry("tool", "TypeScript", 10, null);
  seed(index, [row], "topic:developer-tools");
  seed(
    index,
    [
      {
        ...row,
        repo: { ...row.repo, stargazers_count: 20, pushed_at: "2026-11-02" },
      },
    ],
    "is:public",
    "2026-11-02T01:00:00Z",
  );
  seed(index, [row], "is:public", "2026-11-01T00:00:00Z");
  assert.equal(
    index.search("topic:developer-tools language:TypeScript").total,
    1,
  );
  assert.equal(index.search("is:public").items[0].repo.stargazers_count, 20);
  seed(index, [{ ...row, repo: { ...row.repo, private: true } }]);
  assert.equal(index.search("is:public").total, 0);
});

test("local pagination has stable tie breakers and never duplicates candidates", () => {
  const index = createPreparedProjectIndex();
  const rows = Array.from({ length: 27 }, (_, i) =>
    entry(String(i).padStart(2, "0"), "Go", 10, null),
  );
  seed(index, rows);
  seed(index, rows.slice(0, 15), "topic:developer-tools");
  const pages = [1, 2, 3].flatMap(
    (page) => index.search("language:Go", "stars", page).items,
  );
  assert.equal(new Set(pages.map((e) => e.repo.full_name)).size, 27);
  assert.deepEqual(
    pages.map((e) => e.repo.full_name),
    rows.map((e) => e.repo.full_name),
  );
});
