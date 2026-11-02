import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { catalog, ready, trial } from "./fixtures/trials.mjs";

const envelope = (data: unknown) => ({
  data,
  source: "live",
  fetchedAt: new Date().toISOString(),
});
const repo = (name: string) => ({
  id: name.length,
  owner: { login: "speed", avatar_url: "" },
  name,
  full_name: `speed/${name}`,
  description: `Response for ${name}`,
  language: "TypeScript",
  stargazers_count: 42,
  forks_count: 0,
  pushed_at: null,
  created_at: null,
  topics: [],
  html_url: `https://github.com/speed/${name}`,
  default_branch: "main",
  private: false,
});
const categoryName = (query: string) =>
  query.includes("artificial-intelligence")
    ? "ai"
    : query.includes("design-tools")
      ? "design"
      : "all";
async function setup(page: Page, idle = false) {
  if (!idle)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        value: { saveData: true },
      });
    });
  const requests: string[] = [];
  const posts: string[] = [];
  await page.route("**/api/observatory/**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") posts.push(url.pathname);
    if (url.pathname.endsWith("/status"))
      return route.fulfill({ json: envelope({ cardGeneration: false }) });
    if (url.pathname.endsWith("/cards/ranking"))
      return route.fulfill({
        json: envelope({
          id: "a".repeat(32),
          state: "ready",
          pages: [
            {
              number: 1,
              state: "ready",
              items: [],
              cards: {},
              errors: {},
              total: 1,
            },
          ],
        }),
      });
    if (url.pathname.endsWith("/trials"))
      return route.fulfill({
        json: envelope(url.searchParams.has("repo") ? ready : catalog),
      });
    if (url.pathname.endsWith("/trends"))
      return route.fulfill({
        json: envelope({
          repositories: [repo(url.searchParams.get("kind") || "stars")],
          total: 1,
          growth: { ready: false, items: [], coverage: "fixture" },
        }),
      });
    return route.fulfill({
      json: envelope({ image: null, events: [], bars: [] }),
    });
  });
  await page.route("**/api/github/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search")) {
      requests.push(url.search);
      const name =
        categoryName(url.searchParams.get("q") || "") +
        "-" +
        url.searchParams.get("page") +
        (url.searchParams.get("q")?.includes("language:") ? "-ts" : "");
      return route.fulfill({
        json: envelope({
          items: [repo(name)],
          total_count: 3,
          incomplete_results: false,
        }),
      });
    }
    return route.fulfill({
      json: envelope({ content: "# Fixture README", path: "README.md" }),
    });
  });
  return { requests, posts };
}
async function clickFrame(
  page: Page,
  selector: string,
  content = ".project-card",
) {
  return page.evaluate(
    async ({ selector, content }) => {
      const start = performance.now();
      const element = document.querySelector(selector) as HTMLElement;
      const hashChange =
        element instanceof HTMLAnchorElement && element.hash !== location.hash
          ? new Promise<void>((resolve) =>
              window.addEventListener("hashchange", () => resolve(), {
                once: true,
              }),
            )
          : Promise.resolve();
      element.click();
      await hashChange;
      await new Promise(requestAnimationFrame);
      return {
        elapsed: performance.now() - start,
        content: [...document.querySelectorAll(content)]
          .map((node) => node.textContent)
          .join(" "),
        skeletons: document.querySelectorAll(".skeleton-grid, .page-loader")
          .length,
        inert: document.querySelectorAll(
          ".project-grid[inert], .project-grid [inert]",
        ).length,
      };
    },
    { selector, content },
  );
}

test("visited categories restore all pages in the next frame and filters keep independent caches", async ({
  page,
}) => {
  const { requests } = await setup(page);
  await page.goto("/");
  await expect(page.locator(".project-card")).toContainText("all-1");
  await page.getByRole("button", { name: "AI 与智能", exact: true }).click();
  await expect(page.locator(".project-card")).toContainText("ai-1");
  await page.getByRole("button", { name: "加载更多项目" }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByRole("button", { name: "设计与创意", exact: true }).click();
  await expect(page.locator(".project-card")).toContainText("design-1");
  const before = requests.length;
  const frame = await clickFrame(
    page,
    ".category-filters button:nth-of-type(2)",
  );
  expect(frame.content).toContain("ai-1");
  expect(frame.content).toContain("ai-2");
  expect(frame.skeletons).toBe(0);
  expect(frame.inert).toBe(0);
  expect(requests).toHaveLength(before);
  await page.getByLabel("按编程语言筛选").selectOption("TypeScript");
  await expect(page.locator(".project-card")).toContainText("ai-1-ts");
  await page.getByLabel("按编程语言筛选").selectOption("");
  await expect(page.locator(".project-card")).toHaveCount(2);
  expect(
    requests.filter(
      (q) =>
        new URLSearchParams(q).get("q") === "topic:artificial-intelligence",
    ),
  ).toHaveLength(2);
});

test("late responses warm their own category without replacing the active list or duplicating GETs", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/github/search?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") || "";
    if (!query.includes("artificial-intelligence")) return route.fallback();
    calls++;
    await gate;
    return route.fulfill({
      json: envelope({
        items: [repo("delayed-ai")],
        total_count: 1,
        incomplete_results: false,
      }),
    });
  });
  await page.goto("/");
  await expect(page.locator(".project-card")).toContainText("all-1");
  await page.getByRole("button", { name: "AI 与智能", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "设计与创意", exact: true }).click();
  await expect(page.locator(".project-card")).toContainText("design-1");
  release();
  await page.waitForResponse((response) =>
    response.url().includes("q=topic%3Aartificial-intelligence"),
  );
  await expect(page.locator(".project-card")).toContainText("design-1");
  const frame = await clickFrame(
    page,
    ".category-filters button:nth-of-type(2)",
  );
  expect(frame.content).toContain("delayed-ai");
  expect(frame.skeletons).toBe(0);
  expect(calls).toBe(1);
});

test("idle preloading and navigation intent show untouched categories, rankings and trials without loading frames", async ({
  page,
}) => {
  const { requests, posts } = await setup(page, true);
  const seen: string[] = [];
  page.on("request", (request) => seen.push(request.url()));
  await page.goto("/");
  await expect(page.locator(".project-card")).toContainText("all-1");
  await expect
    .poll(
      () =>
        requests.filter(
          (q) => new URLSearchParams(q).get("q") === "topic:database",
        ).length,
    )
    .toBe(1);
  const before = requests.length;
  const frame = await clickFrame(
    page,
    ".category-filters button:nth-of-type(2)",
  );
  expect(frame.content).toContain("ai-1");
  expect(frame.skeletons).toBe(0);
  expect(requests).toHaveLength(before);
  expect(posts).toHaveLength(0);
  const ranking = await clickFrame(
    page,
    '.site-navigation a[href="#/trends"]',
    ".ranking-row",
  );
  expect(ranking.skeletons).toBe(0);
  await expect(page.locator(".ranking-row")).toHaveCount(1);
  const trials = await clickFrame(
    page,
    '.site-navigation a[href="#/stories"]',
    ".trial-library-card",
  );
  expect(trials.content).toContain(trial.name);
  expect(trials.skeletons).toBe(0);
  expect(
    seen.filter((url) => url.endsWith("/api/observatory/trials")),
  ).toHaveLength(1);
  expect(posts.every((path) => path.endsWith("/cards/ranking"))).toBe(true);
});

test("stale categories stay usable during background refresh and retain content on network failure", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await expect(page.locator(".project-card")).toContainText("all-1");
  await page.getByRole("button", { name: "AI 与智能", exact: true }).click();
  await expect(page.locator(".project-card")).toContainText("ai-1");
  await page.getByRole("button", { name: "全部", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let refreshes = 0;
  await page.route("**/api/github/search?*", async (route) => {
    if (
      !new URL(route.request().url()).searchParams
        .get("q")
        ?.includes("artificial-intelligence")
    )
      return route.fallback();
    refreshes++;
    await gate;
    return route.fulfill({ status: 503, json: { error: "模拟断网" } });
  });
  await page.clock.setFixedTime(new Date(Date.now() + 6 * 60_000));
  const frame = await clickFrame(
    page,
    ".category-filters button:nth-of-type(2)",
  );
  expect(frame.content).toContain("ai-1");
  expect(frame.inert).toBe(0);
  await expect.poll(() => refreshes).toBe(1);
  await page
    .getByRole("button", { name: "收藏 speed/ai-1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "取消收藏 speed/ai-1", exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("模拟断网");
  await expect(page.locator(".project-card")).toContainText("ai-1");
});

test("trial detail intent and revisits share saved data without speculative generation", async ({
  page,
}) => {
  const { posts } = await setup(page, true);
  await page.goto("/");
  await page.locator('.site-navigation a[href="#/stories"]').click();
  const link = page.locator(".trial-library-card");
  await expect(link).toHaveCount(1);
  const response = page.waitForResponse((response) =>
    response.url().includes("trials?repo="),
  );
  await link.hover();
  await response;
  const frame = await clickFrame(page, ".trial-library-card", ".trial-page");
  expect(frame.content).toContain(trial.name);
  expect(frame.content).not.toContain("正在读取项目资料");
  expect(frame.skeletons).toBe(0);
  await page.locator('.site-navigation a[href="#/stories"]').click();
  await expect(page.locator(".trial-library-card")).toHaveCount(1);
  const again = await clickFrame(page, ".trial-library-card", ".trial-page");
  expect(again.content).toContain(trial.name);
  expect(posts).toHaveLength(0);
});

test("generation invalidates the shared catalog even when an older list GET finishes late", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let catalogs = 0;
  let generated = false;
  await page.route("**/api/observatory/trials**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      generated = true;
      return route.fulfill({ json: envelope(ready) });
    }
    if (url.searchParams.has("repo"))
      return route.fulfill({
        json: envelope({ ...ready, trial: generated ? trial : null }),
      });
    catalogs++;
    if (catalogs === 1) {
      await gate;
      return route.fulfill({ json: envelope({ ...catalog, trials: [] }) });
    }
    return route.fulfill({ json: envelope(catalog) });
  });
  await page.goto("/");
  await expect.poll(() => catalogs).toBe(1);
  await page.evaluate(() => {
    location.hash = "/trial/sample/notebook";
  });
  await page.getByRole("button", { name: "生成项目试用", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "README 中文转述" }),
  ).toBeVisible();
  release();
  await expect.poll(() => catalogs).toBe(2);
  await page.locator('.site-navigation a[href="#/stories"]').click();
  await expect(page.locator(".trial-library-card")).toHaveCount(1);
});
