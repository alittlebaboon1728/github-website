import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import categories from "../shared/discovery-categories.json" with { type: "json" };
import { catalog } from "./fixtures/trials.mjs";

const envelope = (data: unknown) => ({
  data,
  source: "cache",
  fetchedAt: "2026-11-01T00:00:00Z",
});
function result(query: string, number = 1, pending = 0) {
  const category =
    categories.find((item) => item.query === query)?.id || "custom";
  const items = Array.from({ length: pending ? 0 : 12 }, (_, index) => ({
    id: number * 100 + index,
    full_name: `prepared/${category}-${number}-${index}`,
    name: `${category}-${number}-${index}`,
    owner: { login: "prepared", avatar_url: "" },
    description: "Original project description in English.",
    language: "TypeScript",
    stargazers_count: 100,
    forks_count: 1,
    html_url: `https://github.com/prepared/${category}-${number}-${index}`,
    default_branch: "main",
    private: false,
    topics: [],
  }));
  return envelope({
    items,
    total_count: 60,
    incomplete_results: false,
    prepared: true,
    pending_count: pending,
    cards: Object.fromEntries(
      items.map((repo) => [
        repo.full_name,
        {
          fullName: repo.full_name,
          title: "提前准备好的中文项目",
          category: "工具",
          summary: `${category} 分类第 ${number} 页的中文介绍已由服务端提前准备，可以直接阅读。`,
          audience: "需要了解项目的人",
          features: [],
          start: "阅读项目文档。",
          limitation: "核对平台支持。",
          visual: {
            layout: "flow",
            palette: "forest",
            caption: "中文项目介绍",
            nodes: [],
          },
          sourceUrl: `${repo.html_url}#readme`,
          sourceKind: "readme",
          sourceWarning: null,
          model: "fixture",
          generatedAt: "2026-11-01",
        },
      ]),
    ),
  });
}
async function setup(
  page: Page,
  search?: (query: string, number: number) => ReturnType<typeof result>,
) {
  const reads: string[] = [],
    posts: string[] = [];
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posts.push(path);
    if (path.endsWith("/status"))
      return route.fulfill({
        json: envelope({ cardGeneration: true, discoveryBackground: true }),
      });
    if (path.endsWith("/catalog"))
      return route.fulfill({
        json: envelope({
          pages: categories.flatMap((category) =>
            [1, 2, 3].map((number) => ({
              q: category.query,
              sort: "stars",
              page: number,
              result: result(category.query, number),
            })),
          ),
        }),
      });
    if (path.endsWith("/trials"))
      return route.fulfill({ json: envelope(catalog) });
    if (path.endsWith("/trends")) {
      const prepared = result("is:public").data;
      return route.fulfill({
        json: envelope({
          repositories: prepared.items,
          cards: prepared.cards,
          prepared: true,
          pending_count: 0,
          total: 60,
          growth: { ready: false, items: [], coverage: "fixture" },
        }),
      });
    }
    return route.fulfill({
      json: envelope({ image: null, bars: [], events: [] }),
    });
  });
  await page.route("**/api/github/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search")) {
      reads.push(url.search);
      return route.fulfill({
        json: (search || result)(
          url.searchParams.get("q")!,
          Number(url.searchParams.get("page")),
        ),
      });
    }
    return route.fulfill({
      json: envelope({ content: "# README", path: "README.md" }),
    });
  });
  return { reads, posts };
}

test("fresh client receives Chinese directly, all six categories and next pages switch from prepared cache", async ({
  page,
}) => {
  const { reads, posts } = await setup(page);
  await page.goto("/");
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { peekResource } = await import("/src/resourceCache.ts");
        return Boolean(
          peekResource("github:/search?q=topic%3Adatabase&sort=stars&page=3")
            ?.value,
        );
      }),
    )
    .toBe(true);
  const initial = reads.length;
  for (const category of categories) {
    await page
      .getByRole("button", {
        name: category.id === "all" ? "全部" : category.name,
        exact: true,
      })
      .click();
    await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
    await expect(page.locator(".project-card").first()).toContainText(
      `${category.id} 分类第 1 页的中文介绍`,
    );
    await expect(page.locator(".skeleton-grid")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(24);
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(36);
  expect(reads.length).toBe(initial);
  await page.getByRole("link", { name: "趋势与榜单" }).click();
  await expect(page.locator(".ranking-row")).toHaveCount(10);
  await expect(page.locator(".ranking-row").first()).toContainText("中文介绍");
  expect(posts).toEqual([]);
});

test("new range shows preparation progress, polls without generation POSTs and preserves previous pages", async ({
  page,
}) => {
  let polls = 0;
  const { posts } = await setup(page, (query, number) => {
    if (query === "uncached" && number === 2 && ++polls < 3)
      return result(query, number, 12);
    return result(query, number);
  });
  await page.goto("/#/discover?q=uncached");
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(
    page.getByText("正在准备这个范围的中文介绍", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
  await expect(page.getByText("没有找到匹配的项目")).toHaveCount(0);
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(24, {
    timeout: 12_000,
  });
  expect(posts).toEqual([]);
});

test("failed uncached category clears skeletons and offers a usable retry", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/github/search?**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "unavailable")
      return route.fulfill({
        status: 503,
        json: { error: "项目列表暂时不可用，请重试。" },
      });
    return route.fallback();
  });
  await page.goto("/#/discover?q=unavailable");
  await expect(page.getByRole("alert")).toContainText("项目列表暂时不可用");
  await expect(page.locator(".skeleton-grid")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新连接" })).toBeVisible();
  await page.getByRole("button", { name: "网站与应用", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
  await page.getByRole("button", { name: "数据与后端", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
});

function mixedResult(query: string, number = 1) {
  const value = result(query, number);
  value.data.items = value.data.items.map((repo, i) => ({
    ...repo,
    language: ["C++", "Python", "C", "TypeScript"][i % 4],
    stargazers_count: number * 100 + i,
    pushed_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  }));
  return value;
}
async function filterSetup(page: Page) {
  const calls = await setup(page, mixedResult);
  await page.route("**/api/observatory/catalog", (route) =>
    route.fulfill({
      json: envelope({
        pages: categories.flatMap((category) =>
          [1, 2, 3].map((number) => ({
            q: category.query,
            sort: "stars",
            page: number,
            result: mixedResult(category.query, number),
          })),
        ),
      }),
    }),
  );
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { peekResource } = await import("/src/resourceCache.ts");
        return Boolean(
          peekResource("github:/search?q=topic%3Adatabase&sort=stars&page=3")
            ?.value,
        );
      }),
    )
    .toBe(true);
  return calls;
}

test("language and sort changes show matching Chinese in the next frame while network requests are held", async ({
  page,
}) => {
  const { posts } = await filterSetup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/github/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q")!;
    if (!query.includes("language:")) return route.fallback();
    await gate;
    const value = mixedResult("is:public");
    const language = query.split("language:")[1];
    value.data.items = value.data.items.filter(
      (repo) => repo.language === language,
    );
    value.data.total_count = value.data.items.length;
    await route.fulfill({ json: value });
  });
  try {
    for (const [language, sort] of [
      ["C++", "stars"],
      ["Python", "updated"],
      ["TypeScript", "best-match"],
      ["C++", "updated"],
    ]) {
      const frame = await page.evaluate(
        async ({ language, sort }) => {
          const start = performance.now();
          const change = (name: string, value: string) => {
            const select = document.querySelector(
              `select[aria-label="${name}"]`,
            ) as HTMLSelectElement;
            select.value = value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          };
          change("按编程语言筛选", language);
          change("项目排序", sort);
          await new Promise(requestAnimationFrame);
          return {
            elapsed: performance.now() - start,
            cards: document.querySelectorAll(".project-card.has-ai-summary")
              .length,
            languages: [
              ...document.querySelectorAll(
                ".project-card .trend-card-stats > span:first-child",
              ),
            ].map((e) => e.textContent?.trim()),
            skeletons: document.querySelectorAll(".skeleton-grid").length,
          };
        },
        { language, sort },
      );
      expect(frame.cards).toBe(12);
      expect(frame.languages.every((value) => value === language)).toBe(true);
      expect(frame.skeletons).toBe(0);
      // The upstream response is still held: availability at this animation
      // frame verifies the cache path independently of CI rendering speed.
    }
    await expect(
      page.getByRole("status").filter({ hasText: "符合条件" }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(3);
  await expect(page.locator(".trend-card-stats > span:first-child")).toHaveText(
    ["C++", "C++", "C++"],
  );
  await expect(
    page.getByText("已显示本机收录中符合条件的项目", { exact: false }),
  ).toHaveCount(0);
  expect(posts).toEqual([]);
});

test("a failed filter update retains matching Chinese, stops polling and remains usable on tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await filterSetup(page);
  let attempts = 0;
  await page.route("**/api/github/search?**", (route) => {
    if (
      !new URL(route.request().url()).searchParams
        .get("q")
        ?.includes("language:Python")
    )
      return route.fallback();
    attempts++;
    return route.fulfill({
      status: 503,
      json: { error: "暂时无法补全筛选结果，请重试。" },
    });
  });
  await page.getByLabel("按编程语言筛选").selectOption("Python");
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12);
  await expect(page.getByRole("alert")).toContainText("暂时无法补全筛选结果");
  await page.waitForTimeout(1800);
  expect(attempts).toBe(1);
  await expect(page.locator(".skeleton-grid")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "数据与后端", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(9);
});

test("completing a filtered query replaces its local cohort and restarts exact pagination from page one", async ({
  page,
}) => {
  await filterSetup(page);
  let ready = false;
  const pages: number[] = [];
  await page.route("**/api/github/search?**", (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get("q")?.includes("language:C++"))
      return route.fallback();
    const number = Number(url.searchParams.get("page"));
    pages.push(number);
    const value = mixedResult(ready ? "complete" : "is:public", number);
    if (ready)
      value.data.items = value.data.items.map((repo) => ({
        ...repo,
        language: "C++",
      }));
    else
      value.data.items = value.data.items.filter(
        (repo) => repo.language === "C++",
      );
    return route.fulfill({
      json: {
        ...value,
        data: {
          ...value.data,
          total_count: 24,
          filter_preview: !ready,
          refresh_pending: !ready,
        },
      },
    });
  });
  await page.getByLabel("按编程语言筛选").selectOption("C++");
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(3);
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(6);
  ready = true;
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(12, {
    timeout: 6000,
  });
  await expect(page.locator(".project-card").first()).toContainText(
    "custom-1-",
  );
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(24);
  expect(pages.at(-1)).toBe(2);
  await expect(page.locator(".project-card").last()).toContainText("custom-2-");
});
