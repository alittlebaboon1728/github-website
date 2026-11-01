import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const repo = (n: number) => ({
  id: n,
  name: `project-${n}`,
  full_name: `ranking/project-${n}`,
  owner: { login: "ranking", avatar_url: "" },
  description: `Original description ${n}.`,
  language: "TypeScript",
  stargazers_count: 50000 - n,
  forks_count: 10,
  pushed_at: "2026-11-01",
  created_at: "2026-01-01",
  topics: [],
  private: false,
  html_url: `https://github.com/ranking/project-${n}`,
  default_branch: "main",
});
const card = (name: string) => ({
  fullName: name,
  title: "整理个人资料与笔记",
  category: "笔记工具",
  summary: `这是 ${name} 的中文总结。它帮助用户整理个人资料，按关键词检索笔记，并将需要的内容导出留存。`,
  audience: "需要整理笔记的人",
  evidence: "Original description.",
  features: [
    {
      title: "整理资料",
      text: "检索个人笔记内容。",
      quote: "Original description.",
    },
  ],
  start: "阅读项目 README。",
  limitation: "平台支持待确认。",
  model: "fixture",
  generatedAt: "2026-11-01",
  sourceUrl: `https://github.com/${name}#readme`,
  sourceKind: "readme",
  sourceWarning: null,
});
const envelope = (data: unknown) => ({
  data,
  source: "live",
  fetchedAt: "2026-11-01T08:00:00Z",
});
const ranking = (ids: number[]) => ({
  repositories: ids.map(repo),
  query: "is:public stars:>1000",
  scope: "测试范围",
  total: ids.length,
  persistence: true,
  growth: { ready: false, items: [], days: 7, coverage: "真实快照差值" },
});
const job = (
  names: string[],
  state: string,
  complete: string[],
  failed: string[] = [],
) => ({
  id: "a".repeat(32),
  state,
  pages: [
    {
      number: 1,
      state: state === "running" ? "generating" : state,
      items: names.map((name) => repo(Number(name.split("-").at(-1)))),
      total: names.length,
      cards: Object.fromEntries(complete.map((name) => [name, card(name)])),
      errors: Object.fromEntries(
        failed.map((name) => [name, "总结生成失败，请重试。"]),
      ),
    },
  ],
});
async function base(page: Page, ids: number[]) {
  await page.route("**/api/observatory/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/trends"))
      return route.fulfill({ json: envelope(ranking(ids)) });
    return route.fulfill({
      status: 503,
      json: { error: "Fixture unavailable" },
    });
  });
  await page.route("**/api/github/**", (route) =>
    route.fulfill({
      json: envelope({ content: "Original description.", path: "README.md" }),
    }),
  );
}

test("ranking progressively summarizes visible projects without changing order; Chinese content follows previews and favorites", async ({
  page,
}) => {
  await base(
    page,
    Array.from({ length: 13 }, (_, i) => i + 1),
  );
  const batches: string[][] = [];
  let done = false;
  await page.route("**/api/observatory/cards/ranking", (route) => {
    const names = route.request().postDataJSON().repositories as string[];
    batches.push(names);
    return route.fulfill({
      status: 202,
      json: envelope(
        job(
          names,
          done ? "ready" : "running",
          done ? names : names.slice(0, 1),
        ),
      ),
    });
  });
  await page.route("**/api/observatory/cards/jobs/*", (route) => {
    const names = batches.at(-1)!;
    return route.fulfill({
      json: envelope(
        job(
          names,
          done ? "ready" : "running",
          done ? names : names.slice(0, 1),
        ),
      ),
    });
  });
  await page.goto("/#/trends");
  await expect(page.locator(".site-header .header-search")).toHaveCount(0);
  await expect(page.locator(".ranking-row")).toHaveCount(10);
  await expect(page.locator(".ranking-row.has-ai-summary")).toHaveCount(1);
  await expect(page.locator(".ranking-generation")).toContainText("1 / 10");
  expect(batches[0]).toEqual(
    Array.from({ length: 10 }, (_, i) => `ranking/project-${i + 1}`),
  );
  const rows = page.locator(".ranking-row");
  expect(
    await rows.locator(".ranking-project-title h2").allTextContents(),
  ).toEqual(Array.from({ length: 10 }, (_, i) => `project-${i + 1}`));
  done = true;
  await expect(page.locator(".ranking-row.has-ai-summary")).toHaveCount(10);
  await rows
    .first()
    .getByRole("button", { name: "查看原文", exact: true })
    .click();
  await expect(rows.first().locator(".ranking-summary")).toHaveText(
    "Original description 1.",
  );
  await rows
    .first()
    .getByRole("button", { name: "显示中文", exact: true })
    .click();
  await expect(rows.first().locator(".ranking-summary")).toContainText(
    "中文总结",
  );
  await rows
    .first()
    .getByRole("button", { name: "快速了解 ranking/project-1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "这是 ranking/project-1 的中文总结",
  );
  await page.keyboard.press("Escape");
  await rows
    .first()
    .getByRole("button", {
      name: "收藏榜单项目 ranking/project-1",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "查看更多项目", exact: true }).click();
  await expect(page.locator(".ranking-row.has-ai-summary")).toHaveCount(13);
  expect(batches.at(-1)).toHaveLength(13);
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: /我的收藏/ })
    .click();
  await expect(page.locator(".project-card")).toContainText(
    "这是 ranking/project-1 的中文总结",
  );
  const requests = batches.length;
  await page.goBack();
  await expect(page.locator(".ranking-row.has-ai-summary")).toHaveCount(10);
  expect(batches).toHaveLength(requests);
});

test("summary failures preserve originals and retry; a filter switch cannot receive a previous ranking's pending response", async ({
  page,
}) => {
  await base(page, [1, 2]);
  let requests = 0,
    resolveOld: (() => void) | undefined;
  await page.route("**/api/observatory/trends?*", (route) =>
    route.fulfill({
      json: envelope(
        ranking(
          new URL(route.request().url()).searchParams.get("language")
            ? [99]
            : [1, 2],
        ),
      ),
    }),
  );
  await page.route("**/api/observatory/cards/ranking", async (route) => {
    const names = route.request().postDataJSON().repositories as string[];
    requests++;
    if (names[0].endsWith("99"))
      return route.fulfill({
        status: 202,
        json: envelope(job(names, "ready", names)),
      });
    if (requests === 1)
      return route.fulfill({
        status: 202,
        json: envelope(
          job(names, "partial", names.slice(0, 1), names.slice(1)),
        ),
      });
    return route.fulfill({
      status: 202,
      json: envelope(job(names, "running", names.slice(0, 1))),
    });
  });
  await page.route("**/api/observatory/cards/jobs/*", async (route) => {
    await new Promise<void>((resolve) => {
      resolveOld = resolve;
    });
    await route
      .fulfill({
        json: envelope(
          job(["ranking/project-1", "ranking/project-2"], "ready", [
            "ranking/project-1",
            "ranking/project-2",
          ]),
        ),
      })
      .catch(() => {});
  });
  await page.goto("/#/trends");
  await expect(page.locator(".ranking-row").nth(1)).toContainText(
    "Original description 2.",
  );
  await page.getByRole("button", { name: "重试中文总结" }).click();
  await expect.poll(() => Boolean(resolveOld)).toBe(true);
  await page.getByLabel("榜单语言", { exact: true }).selectOption("Python");
  await expect(page.locator(".ranking-row")).toHaveCount(1);
  await expect(page.locator(".ranking-row")).toContainText(
    "这是 ranking/project-99 的中文总结",
  );
  resolveOld!();
  await expect(page.locator(".ranking-row")).not.toContainText("project-1 ");
  await expect(page.locator(".ranking-project-title h2")).toHaveText(
    "project-99",
  );
});

test("mobile ranking filters start folded and all controls, summaries and real trend values fit", async ({
  page,
}) => {
  await base(page, [1]);
  await page.route("**/api/observatory/cards/ranking", (route) =>
    route.fulfill({
      status: 202,
      json: envelope(
        job(["ranking/project-1"], "ready", ["ranking/project-1"]),
      ),
    }),
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/#/trends");
  await expect(page.getByLabel("榜单语言", { exact: true })).not.toBeVisible();
  await page.getByText("筛选榜单范围", { exact: true }).click();
  await expect(page.getByLabel("榜单语言", { exact: true })).toBeVisible();
  await expect(page.locator(".ranking-row")).toContainText("AI 中文总结");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "热门趋势", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "正在积累数据" }),
  ).toBeVisible();
  await expect(page.locator(".star-sparkline")).toHaveCount(0);
});
