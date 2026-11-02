import { test, expect } from "@playwright/test";
const envelope = (data: unknown) => ({
  data,
  source: "live",
  fetchedAt: new Date().toISOString(),
});
function repo(n: number) {
  return {
    id: n,
    owner: { login: "fixture", avatar_url: "" },
    name: `tool-${n}`,
    full_name: `fixture/tool-${n}`,
    description: "A personal note taking tool.",
    language: "TypeScript",
    stargazers_count: 1,
    forks_count: 0,
    pushed_at: "2026-10-31",
    topics: ["notes"],
    html_url: `https://github.com/fixture/tool-${n}`,
    homepage: null,
    license: { spdx_id: "MIT" },
    default_branch: "main",
    created_at: "2026-10-01",
    open_issues_count: 0,
    archived: false,
    private: false,
  };
}
function card(n: number) {
  return {
    fullName: `fixture/tool-${n}`,
    title: "在自己的设备整理个人笔记",
    category: "笔记工具",
    summary:
      "将想法记录为笔记，按关键词找回内容，再导出文件留存。这个项目适合需要管理个人记录的用户。",
    audience: "需要整理个人想法的人",
    evidence: "A personal note taking tool.",
    features: [
      {
        title: "找回相关记录",
        text: "按关键词搜索笔记内容。",
        quote: "A personal note taking tool.",
      },
    ],
    start: "先阅读项目文档，确认安装步骤。",
    limitation: "同步方式与平台支持需要核对。",
    visual: {
      layout: n % 3 === 0 ? "layers" : n % 3 === 1 ? "flow" : "hub",
      palette: n % 2 === 0 ? "violet" : "forest",
      caption: "从记录到找回想法",
      nodes: [
        { label: "记录想法", detail: "写下个人笔记", icon: "file" },
        { label: "搜索内容", detail: "找回相关记录", icon: "search" },
        { label: "导出笔记", detail: "将内容保存下来", icon: "book" },
      ],
    },
    model: "fixture-flash",
    generatedAt: "2026-10-31",
    sourceUrl: `https://github.com/fixture/tool-${n}#readme`,
    sourceKind: "readme",
    sourceWarning: null,
  };
}

test("ordinary pagination stays usable during summaries and continues updating earlier pages", async ({
  page,
}) => {
  let firstReady = false;
  const makePage = (number: number, ready: boolean) => ({
    number,
    state: ready ? "ready" : "generating",
    total: 60,
    errors: {},
    items: Array.from({ length: 12 }, (_, i) =>
      repo((number - 1) * 12 + i + 1),
    ),
    cards: ready
      ? Object.fromEntries(
          Array.from({ length: 12 }, (_, i) => {
            const id = (number - 1) * 12 + i + 1;
            return [`fixture/tool-${id}`, card(id)];
          }),
        )
      : {},
  });
  const initial = () => ({
    id: "initial",
    state: firstReady ? "ready" : "running",
    pages: [1, 2, 3].map((n) => makePage(n, firstReady)),
  });
  await page.route("**/api/github/**", (route) =>
    route.fulfill({
      json: envelope({
        items: [repo(1)],
        total_count: 60,
        incomplete_results: false,
      }),
    }),
  );
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({ json: envelope({ cardGeneration: true }) });
    if (path.endsWith("/cards/pages")) {
      const body = route.request().postDataJSON();
      return route.fulfill({
        json: envelope(
          body.page === 4
            ? { id: "more", state: "ready", pages: [makePage(4, true)] }
            : initial(),
        ),
      });
    }
    if (path.endsWith("/cards/jobs/initial"))
      return route.fulfill({ json: envelope(initial()) });
    return route.fulfill({
      json: envelope({ events: [], image: null, trials: [] }),
    });
  });
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(36);
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(0);
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(48);
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
  firstReady = true;
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(48);
});
test("AI prepares three pages progressively, generates exactly one later page on demand, and reuses Chinese content in quick read and bookmarks", async ({
  page,
}) => {
  const starts: { page: number; count: number; q: string }[] = [];
  let polls = 0;
  const makePage = (n: number, ready = true) => ({
    number: n,
    state: ready ? "ready" : "generating",
    items: Array.from({ length: 12 }, (_, i) => repo((n - 1) * 12 + i + 1)),
    cards: Object.fromEntries(
      Array.from({ length: ready ? 12 : 1 }, (_, i) => {
        const id = (n - 1) * 12 + i + 1;
        return [`fixture/tool-${id}`, card(id)];
      }),
    ),
    errors: {},
    total: 60,
  });
  await page.route("**/api/github/**", (route) =>
    route.fulfill({
      json: envelope({
        items: [repo(1)],
        total_count: 60,
        incomplete_results: false,
      }),
    }),
  );
  await page.route("**/api/observatory/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({
        json: envelope({ aiConfigured: true, cardGeneration: true }),
      });
    if (path.endsWith("/cards/pages")) {
      const body = route.request().postDataJSON();
      starts.push(body);
      return route.fulfill({
        status: 202,
        json: envelope({
          id: "fixture",
          state: body.page === 4 ? "ready" : "running",
          pages:
            body.page === 4
              ? [makePage(4)]
              : [
                  makePage(1, false),
                  { ...makePage(2), state: "queued", items: [], cards: {} },
                  { ...makePage(3), state: "queued", items: [], cards: {} },
                ],
        }),
      });
    }
    if (path.includes("/cards/jobs/")) {
      polls++;
      return route.fulfill({
        json: envelope({
          id: "fixture",
          state: "ready",
          pages: [makePage(1), makePage(2), makePage(3)],
        }),
      });
    }
    if (path.endsWith("/trends"))
      return route.fulfill({
        json: envelope({
          repositories: [],
          query: "is:public",
          growth: { ready: false, items: [] },
        }),
      });
    return route.fulfill({ json: envelope({ events: [], scope: "fixture" }) });
  });
  await page.goto("/");
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(36);
  expect(starts.every((start) => start.page === 1 && start.count === 3)).toBe(
    true,
  );
  expect(polls).toBeGreaterThan(0);
  await expect(page.locator(".project-card").first()).toContainText(
    "将想法记录为笔记",
  );
  const firstCard = page.locator(".project-card").first();
  await expect(
    firstCard.getByRole("link", { name: "作者 @fixture", exact: true }),
  ).toHaveAttribute("href", "https://github.com/fixture");
  await firstCard
    .getByRole("button", { name: "显示原文", exact: true })
    .click();
  await expect(firstCard).toContainText("A personal note taking tool.");
  await firstCard
    .getByRole("button", { name: "显示中文", exact: true })
    .click();
  await expect(firstCard).toContainText("将想法记录为笔记");
  await page
    .getByRole("button", { name: "快速了解 fixture/tool-1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("找回相关记录");
  await expect(page.getByRole("dialog")).toContainText("AI 中文整理");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "收藏 fixture/tool-1", exact: true })
    .click();
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(48);
  expect(starts.filter((start) => start.page === 4)).toEqual([
    { page: 4, count: 1, q: "is:public", sort: "stars" },
  ]);
  await page.getByRole("link", { name: /我的收藏/ }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(1);
  await expect(page.locator(".project-card")).toContainText("来自 AI 总结");
  const previousRequests = starts.length;
  await page.goBack();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(48);
  expect(starts.length).toBe(previousRequests);
});

test("generation failure retains real project information and retries the missing Chinese card", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/github/**", (route) =>
    route.fulfill({
      json: envelope({
        items: [repo(1)],
        total_count: 1,
        incomplete_results: false,
      }),
    }),
  );
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({ json: envelope({ cardGeneration: true }) });
    if (path.endsWith("/cards/pages")) {
      attempts++;
      const failed = attempts === 1;
      return route.fulfill({
        json: envelope({
          id: "retry",
          state: failed ? "partial" : "ready",
          pages: [
            {
              number: 1,
              state: failed ? "partial" : "ready",
              items: [repo(1)],
              total: 1,
              cards: failed ? {} : { "fixture/tool-1": card(1) },
              errors: failed ? { "fixture/tool-1": "模型暂时不可用" } : {},
            },
          ],
        }),
      });
    }
    if (path.endsWith("/trends"))
      return route.fulfill({
        json: envelope({
          repositories: [],
          growth: { ready: false, items: [] },
        }),
      });
    return route.fulfill({ json: envelope({ events: [] }) });
  });
  await page.goto("/");
  await expect(page.locator(".project-card")).toContainText("模型暂时不可用");
  await expect(page.locator(".project-card")).toContainText(
    "A personal note taking tool.",
  );
  await page.getByRole("button", { name: "重试未完成卡片" }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(1);
  expect(attempts).toBe(2);
});
