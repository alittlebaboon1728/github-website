// Deterministic latency comparison. No network, credentials, or model charges.
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { createCardService } from "../server/cards.mjs";
import { recommend } from "../server/recommend.mjs";
import { createStore } from "../server/storage.mjs";

const source =
  "This project supports organizing and searching personal notes offline.";
const repo = (id) => ({
  id,
  name: `notes-${id}`,
  full_name: `fixture/notes-${id}`,
  private: false,
  archived: false,
  description: source,
  default_branch: "main",
});
const card = {
  title: "整理个人笔记",
  category: "笔记工具",
  summary: "整理和查找个人笔记。",
  audience: "需要整理资料的人",
  evidence: source,
  features: [{ title: "查找笔记", text: "查找记录的资料。", quote: source }],
  start: "阅读项目说明。",
  limitation: "同步方式待核实。",
  visual: {
    caption: "整理笔记",
    nodes: ["记录", "搜索", "阅读"].map((label) => ({
      label,
      detail: "个人笔记",
      icon: "file",
    })),
  },
};
const github = async (path) => {
  if (path.endsWith("/readme")) {
    await delay(30);
    return { data: { content: source, path: "README.md" } };
  }
  const page = Number(
    new URL(path, "http://fixture").searchParams.get("page") || 1,
  );
  return {
    data: {
      items: Array.from({ length: 12 }, (_, i) => repo((page - 1) * 12 + i)),
      total_count: 60,
    },
  };
};
const cards = createCardService({
  github,
  concurrency: Number(process.env.BENCH_CARD_CONCURRENCY || 4),
  store: createStore("unused", false),
  model: {
    configured: true,
    name: "fixture",
    json: async () => {
      await delay(60);
      return card;
    },
  },
});
const start = performance.now();
const job = cards.start({ q: "notes", page: 1, count: 3 });
let listingMs, firstCardMs;
while (cards.get(job.id).state === "running") {
  const pages = cards.get(job.id).pages;
  if (!listingMs && pages.every((p) => p.items.length))
    listingMs = performance.now() - start;
  if (!firstCardMs && pages.some((p) => Object.keys(p.cards).length))
    firstCardMs = performance.now() - start;
  await delay(2);
}
const cardsMs = performance.now() - start;
const aiStart = performance.now();
let firstResultMs;
const result = await recommend(
  { turns: ["寻找离线笔记"], overrides: [] },
  {
    github,
    concurrency: Number(process.env.BENCH_AI_CONCURRENCY || 4),
    partial: () => {
      firstResultMs ??= performance.now() - aiStart;
    },
    model: {
      configured: true,
      json: async (_system, input) => {
        if (input.turns)
          return {
            summary: "寻找离线笔记",
            constraints: [],
            queries: ["notes", "notebook"],
          };
        await delay(input.candidates[0].fullName.endsWith("-0") ? 240 : 60);
        return {
          selections: [
            {
              fullName: input.candidates[0].fullName,
              purpose: "整理笔记",
              reason: "支持搜索笔记",
              evidence: source,
            },
          ],
        };
      },
    },
  },
);
const aiMs = performance.now() - aiStart;
console.log(
  JSON.stringify(
    {
      fixture: "README 30ms, model 60ms, one AI check 240ms",
      listing36Ms: Math.round(listingMs || cardsMs),
      firstCardMs: Math.round(firstCardMs),
      all36CardsMs: Math.round(cardsMs),
      firstAiResultMs: Math.round(firstResultMs || aiMs),
      allAiResultsMs: Math.round(aiMs),
      recommendations: result.selections.length,
    },
    null,
    2,
  ),
);
