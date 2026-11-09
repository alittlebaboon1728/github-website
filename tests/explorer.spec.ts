import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { Repository } from "../src/catalog";
const snapshot = JSON.parse(
  readFileSync(
    new URL("../src/repository-snapshot.json", import.meta.url),
    "utf8",
  ),
) as { repositories: Repository[] };

const first = snapshot.repositories[1];
const second = snapshot.repositories[2];
const example = snapshot.repositories.find(
  (r) => r.fullName === "excalidraw/excalidraw",
)!;
function raw(r: typeof first) {
  return {
    id: Number(r.id),
    owner: { login: r.owner, avatar_url: r.avatar },
    name: r.name,
    full_name: r.fullName,
    description: r.description,
    language: r.language,
    stargazers_count: r.stars,
    forks_count: r.forks,
    pushed_at: r.updated,
    topics: r.tags,
    html_url: r.url,
    homepage: r.homepage,
    license: { spdx_id: r.license },
    default_branch: r.defaultBranch,
    created_at: r.createdAt,
    open_issues_count: r.openIssues,
    archived: false,
    private: false,
  };
}
const envelope = (data: unknown) => ({
  data,
  source: "live",
  fetchedAt: new Date().toISOString(),
});
async function mockApi(page: Page) {
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/activity") || path.endsWith("/pulse"))
      return route.fulfill({
        json: envelope({ events: [], scope: "测试公开事件样本" }),
      });
    if (path.endsWith("/trends"))
      return route.fulfill({
        json: envelope({
          repositories: [],
          query: "is:public",
          persistence: true,
          growth: { ready: false, items: [], coverage: "测试采集范围" },
        }),
      });
    return route.fulfill({ status: 503, json: { error: "AI 搜索尚未配置。" } });
  });
  await page.route("**/api/github/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search")) {
      const items =
        url.searchParams.get("page") === "2"
          ? [second, example]
          : [first, second];
      return route.fulfill({
        json: envelope({
          items: items.map(raw),
          total_count: 4,
          incomplete_results: false,
        }),
      });
    }
    if (url.pathname.endsWith("/readme"))
      return route.fulfill({
        json: envelope({
          content:
            "# 项目说明\n\n这是一个真正有用的工具。\n\n[安全相对链接](docs/start.md)\n\n[危险链接](javascript:alert(1))\n\n<script>window.pwned=true</script>\n\n![无效图片](javascript:alert(1))",
          path: "README.md",
          html_url: `${first.url}#readme`,
          truncated: false,
        }),
      });
    const full = url.pathname.replace("/api/github/repos/", "");
    const repo = snapshot.repositories.find((r) => r.fullName === full);
    return repo
      ? route.fulfill({ json: envelope(raw(repo)) })
      : route.fulfill({
          status: 404,
          json: { error: "这个公开仓库不存在，或已改名、转为私有。" },
        });
  });
}
test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("real search parameters, language, sort and deduplicated pagination", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让好想法/ })).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(2);
  const request = page.waitForRequest(
    (r) =>
      r.url().includes("/search?") &&
      new URL(r.url()).searchParams.get("q") === "whiteboard",
  );
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill("白板");
  await page.getByRole("button", { name: "搜索项目", exact: true }).click();
  await request;
  const languageRequest = page.waitForRequest(
    (r) =>
      r.url().includes("/search?") &&
      new URL(r.url()).searchParams.get("q") ===
        "whiteboard language:TypeScript",
  );
  await page.getByLabel("按编程语言筛选").selectOption("TypeScript");
  await languageRequest;
  const sorted = page.waitForRequest(
    (r) =>
      r.url().includes("/search?") &&
      new URL(r.url()).searchParams.get("sort") === "updated",
  );
  await page.getByLabel("项目排序").selectOption("updated");
  await sorted;
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByRole("button", { name: "加载更多项目" }).click();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page.getByLabel("项目信息", { exact: true }).click();
  await expect(
    page.getByText("GitHub 实时数据", { exact: false }),
  ).toBeVisible();
});

test("bookmarks persist locally and can be removed", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: `收藏 ${first.fullName}`, exact: true })
    .click();
  await page.getByRole("link", { name: /我的收藏/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: `取消收藏 ${first.fullName}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `取消收藏 ${first.fullName}`, exact: true })
    .click();
  await expect(page.getByText("还没有收藏项目")).toBeVisible();
});

test("category filters update in place and preserve the hero", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const initialUrl = page.url();
  const categoryRequest = page.waitForRequest(
    (r) =>
      r.url().includes("/search?") &&
      new URL(r.url()).searchParams.get("q")?.includes("topic:design-tools") ===
        true,
  );
  await page
    .getByRole("group", { name: "按用途浏览" })
    .getByRole("button", { name: "设计与创意" })
    .click();
  await categoryRequest;
  await expect(page).toHaveURL(initialUrl);
  await expect(
    page
      .getByRole("group", { name: "按用途浏览" })
      .getByRole("button", { name: "设计与创意" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: /让好想法/ })).toBeAttached();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page
    .locator("#project-browser")
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  const scroll = await page.evaluate(() => scrollY);
  const nextRequest = page.waitForRequest(
    (r) =>
      r.url().includes("/search?") &&
      new URL(r.url()).searchParams.get("q") ===
        "topic:artificial-intelligence",
  );
  await page
    .getByRole("group", { name: "按用途浏览" })
    .getByRole("button", { name: "AI 与智能" })
    .click();
  await nextRequest;
  await expect(page.locator("#project-browser")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page).toHaveURL(initialUrl);
  expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(
    5,
  );
});

test("home renders every returned project and paginates beyond six without hiding small or archived repositories", async ({
  page,
}) => {
  const repositories = Array.from({ length: 13 }, (_, index) => ({
    ...raw(first),
    id: 900100 + index,
    name: `project-${index}`,
    full_name: `coverage/project-${index}`,
    html_url: `https://github.com/coverage/project-${index}`,
    owner: { login: "coverage", avatar_url: "" },
    description: index === 0 ? null : `Public repository ${index}`,
    language: index === 0 ? null : "TypeScript",
    topics: [],
    license: null,
    stargazers_count: index,
    archived: index === 0,
  }));
  const queries: string[] = [];
  await page.route("**/api/github/search?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params.get("q")!);
    return route.fulfill({
      json: envelope({
        items:
          params.get("page") === "2"
            ? repositories.slice(12)
            : repositories.slice(0, 12),
        total_count: 13,
        incomplete_results: false,
      }),
    });
  });
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(12);
  await expect(page.locator(".trend-card-identity")).toHaveCount(12);
  await expect(page.locator(".project-card").first()).toContainText("已归档");
  await expect(page.locator(".project-card").first()).toContainText(
    "暂时没有填写简介",
  );
  expect(queries[0]).toBe("is:public");
  await page.getByRole("button", { name: "加载更多项目" }).click();
  await expect(page.locator(".project-card")).toHaveCount(13);
  await expect(page.locator(".trend-summary")).toHaveCount(13);
  await expect(page.getByRole("button", { name: "加载更多项目" })).toHaveCount(
    0,
  );
  await page.locator(".browse-coverage summary").click();
  await expect(page.locator(".browse-coverage")).toContainText(
    "不代表 GitHub 全量收录",
  );
});

test("failed pagination retries the same page and stops when the API has no more items", async ({
  page,
}) => {
  const pages: string[] = [];
  let moreAttempts = 0;
  await page.route("**/api/github/search?*", (route) => {
    const requested = new URL(route.request().url()).searchParams.get("page")!;
    pages.push(requested);
    if (requested === "2") moreAttempts++;
    if (requested === "2" && moreAttempts === 1)
      return route.fulfill({ status: 502, json: { error: "临时连接失败" } });
    return route.fulfill({
      json: envelope({
        items: requested === "1" ? [raw(first)] : [],
        total_count: 20,
        incomplete_results: false,
      }),
    });
  });
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "加载更多项目" }).click();
  await expect(page.getByRole("alert")).toContainText("临时连接失败");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "加载更多项目" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "重新连接" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("#project-browser")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(pages.filter((value) => value === "2")).toEqual(["2", "2"]);
  await expect(page.getByRole("button", { name: "加载更多项目" })).toHaveCount(
    0,
  );
});

test("trial repository URLs open details and README safely renders relative links", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "全站项目搜索" }).fill(example.url);
  await page.getByRole("textbox", { name: "全站项目搜索" }).press("Enter");
  await expect(page).toHaveURL(new RegExp(`/project/${example.fullName}`));
  await expect(
    page.getByRole("heading", { name: "Excalidraw", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "README 原文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "项目说明", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "安全相对链接" }),
  ).toHaveAttribute(
    "href",
    `${example.url}/blob/${encodeURIComponent(example.defaultBranch)}/docs/start.md`,
  );
  const dangerous = await page
    .getByRole("link", { name: "危险链接" })
    .getAttribute("href");
  expect(dangerous).not.toContain("javascript:");
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
  await page.getByRole("button", { name: "仓库资料", exact: false }).click();
  await expect(page.locator(".clone-line")).toContainText(example.fullName);
});

test("unknown public repository has a clear error and recovery", async ({
  page,
}) => {
  await page.goto("/#/project/not-found/not-found");
  await expect(
    page.getByRole("status").filter({ hasText: /这个公开仓库不存在/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/discover$/);
  await expect(page.locator(".project-card")).toHaveCount(2);
});

test("rate limit never masquerades as search results and retry works", async ({
  page,
}) => {
  await page.route("**/api/github/search?**", (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: "GitHub 暂时限制了请求频率，请稍后再试。",
        resetAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  );
  await page.goto("/#/discover?q=unusual-query");
  await expect(page.getByRole("alert")).toContainText("限制了请求频率");
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(page.getByText("离线资料快照", { exact: false })).toHaveCount(0);
  await page.unroute("**/api/github/search?**");
  await page.getByRole("button", { name: "重新连接" }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
});

test("default discovery explicitly labels offline snapshot", async ({
  page,
}) => {
  await page.route("**/api/github/search?**", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "暂时无法连接 GitHub，请稍后重试。" },
    }),
  );
  await page.goto("/");
  await page.getByLabel("项目信息", { exact: true }).click();
  await expect(page.getByText("离线资料快照", { exact: false })).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(
    snapshot.repositories.length,
  );
});

test("public webpage fallback remains usable without inventing missing counts or dates", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/github/search?**", (route) =>
    route.fulfill({
      json: {
        ...envelope({
          items: [
            {
              ...raw(first),
              forks_count: null,
              pushed_at: null,
              created_at: null,
              open_issues_count: null,
            },
          ],
          total_count: 1,
          incomplete_results: false,
        }),
        provider: "github-web",
        warning:
          "资料来自 GitHub 公开网页；网页未提供的派生数、推送时间等字段暂不展示。",
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/discover?q=tools");
  const card = page.locator(".project-card").first();
  await expect(card).toContainText("更新时间未提供");
  await expect(card.locator('[title$=" 次派生"]')).toHaveCount(0);
  await page.getByLabel("项目信息", { exact: true }).click();
  await expect(
    page.getByText("资料来自 GitHub 公开网页", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("项目信息", { exact: true }).click();
  await page
    .getByRole("button", { name: `收藏 ${first.fullName}`, exact: true })
    .click();
  await card.getByRole("button", { name: /快速了解/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("link", { name: /我的收藏/ }).click();
  await expect(page.locator(".project-card")).toContainText("更新时间未提供");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("Chinese guidance uses shared headings and has one whiteboard action in the experience section", async ({
  page,
}) => {
  await page.goto("/#/project/excalidraw/excalidraw");
  const guide = page.getByRole("region", {
    name: "README 中文转述",
    exact: true,
  });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { name: "项目介绍" })).toBeVisible();
  await expect(page.locator(".reader-formal")).toContainText("PNG 或 SVG");
  await expect(
    page.locator(
      ".reader-copy h2, .reader-practice-heading h2, .reader-formal > h2",
    ),
  ).toHaveText(["项目介绍", "使用方法", "动手体验", "正式使用"]);
  await expect(page.locator(".story-player")).toHaveCount(0);
  await expect(page.locator(".excalidraw")).toHaveCount(0);
  await expect(page.locator('[data-action="open-whiteboard"]')).toHaveCount(1);
  await expect(
    page.locator('#hands-on [data-action="open-whiteboard"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(".reader-header button, .reader-start button"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(直接试用|开始画图)$/ }),
  ).toHaveCount(0);
  await page.locator(".reader-developer summary").click();
  await expect(
    page.getByRole("link", { name: "阅读官方集成说明" }),
  ).toHaveAttribute("href", /docs.excalidraw.com/);
  await page.getByRole("button", { name: "README 原文", exact: true }).click();
  await page.getByRole("button", { name: "中文使用说明", exact: true }).click();
  await page.getByRole("button", { name: "打开交互白板", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "中文使用说明", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".excalidraw")).toBeVisible({ timeout: 45000 });
  await expect(page.locator("#hands-on")).toBeFocused();
  await expect(page.locator('[data-action="open-whiteboard"]')).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "继续编辑白板", exact: true }),
  ).toHaveCount(1);
});

test("shared glass controls remain translucent, padded and usable across pages and themes", async ({
  page,
}) => {
  for (const dark of [false, true]) {
    await page.addInitScript(
      (value) => localStorage.setItem("gh-design-dark", JSON.stringify(value)),
      dark,
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [route, selector] of [
        [
          "/#/project/excalidraw/excalidraw",
          ".reader-practice .primary-button, .reader-topline .glass-control, .reader-tabs button",
        ],
        ["/#/stories", ".trial-library-heading .button"],
        ["/#/trends", ".ranking-tabs button"],
      ]) {
        await page.goto(route);
        const controls = page.locator(selector);
        await expect(controls.first()).toBeVisible();
        for (const control of await controls.all()) {
          await control.scrollIntoViewIfNeeded();
          const tab = await control.evaluate(
            (element) => !!element.closest(".droplet-tabs"),
          );
          const surface = tab ? control.locator("..") : control;
          await expect(surface).toHaveAttribute(
            "data-lg-refraction",
            tab ? "surface" : "control",
          );
          if (tab) {
            await expect(control).not.toHaveAttribute("data-lg-refraction");
            await expect(surface.locator(".selection-droplet")).toHaveAttribute(
              "data-lg-refraction",
              "surface",
            );
          }
          const style = await control.evaluate((element) => {
            const css = getComputedStyle(element);
            const material = getComputedStyle(
              element.closest(".droplet-tabs") || element,
            );
            const rgba = material.backgroundColor.match(
              /rgba\([\d.,\s]+,\s*([\d.]+)\)/,
            );
            return {
              alpha: rgba ? Number(rgba[1]) : 1,
              filter: material.backdropFilter,
              padding: parseFloat(css.paddingLeft),
              right: parseFloat(css.paddingRight),
              height: element.getBoundingClientRect().height,
              tab: !!element.closest(".glass-tabs"),
            };
          });
          expect(style.alpha).toBeGreaterThan(0);
          expect(style.alpha).toBeLessThan(0.8);
          expect(style.filter).toContain("blur(");
          expect(style.filter).toContain("url(");
          expect(style.padding).toBeGreaterThanOrEqual(10);
          expect(style.right).toBeGreaterThanOrEqual(10);
          expect(style.height).toBeGreaterThanOrEqual(44);
          if (style.tab) expect(style.height).toBeLessThanOrEqual(46);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
  }
});

test("actual editor draws, stores changes, exports SVG, and restores them", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/project/excalidraw/excalidraw");
  await expect(page.locator(".excalidraw")).toHaveCount(0);
  await page.getByRole("button", { name: "打开交互白板" }).click();
  await expect(page.locator(".excalidraw")).toBeVisible({ timeout: 45000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("observatory-excalidraw-scene-v1") || "null",
          )?.elements?.length || 0,
      ),
    )
    .toBeGreaterThan(5);
  const count = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("observatory-excalidraw-scene-v1")!)
        .elements.length,
  );
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await canvas.click({ position: { x: 650, y: 400 } });
  await page.keyboard.press("r");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 650, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 800, box.y + 480, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("observatory-excalidraw-scene-v1")!)
            .elements.length,
      ),
    )
    .toBeGreaterThan(count);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 SVG", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const savedCount = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("observatory-excalidraw-scene-v1")!)
        .elements.length,
  );
  await page.reload();
  await page.getByRole("button", { name: "打开交互白板" }).click();
  await expect(page.locator(".excalidraw")).toBeVisible({ timeout: 45000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("observatory-excalidraw-scene-v1")!)
            .elements.length,
      ),
    )
    .toEqual(savedCount);
  expect(errors).toEqual([]);
});

test("responsive navigation, dark mode and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Header behavior does not depend on external fixture images finishing.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("link", { name: "项目试用", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /好不好用，\s*动手就知道/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "切换深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const width of [360, 390, 600, 768, 820, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("mobile navigation stays expanded and mounted while the droplet travels between pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/discover");
  const nav = page.locator("#project-navigation");
  const header = page.locator(".site-header-inner");
  const originalHeader = await header.elementHandle();
  const originalDroplet = await nav
    .locator(".navigation-droplet")
    .elementHandle();
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await expect
    .poll(() => nav.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  const before = await header.boundingBox();
  for (const name of ["我的收藏", "趋势与榜单", "项目试用", "发现项目"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(nav.locator('[aria-current="page"]')).toHaveText(name);
    await expect(
      page.getByRole("button", { name: "关闭导航", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(nav).not.toHaveAttribute("inert");
    await expect
      .poll(() =>
        nav
          .locator(".navigation-droplet")
          .evaluate((el) => el.getAnimations().length),
      )
      .toBe(1);
    const middle = await nav.locator(".navigation-droplet").evaluate((el) => {
      const animation = el.getAnimations()[0];
      animation.pause();
      animation.currentTime =
        Number(animation.effect!.getTiming().duration) * 0.42;
      return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
    });
    expect(middle).toBeGreaterThan(1);
    expect(await header.boundingBox()).toEqual(before);
    expect(
      await header.evaluate((el, original) => el === original, originalHeader),
    ).toBe(true);
    expect(
      await nav
        .locator(".navigation-droplet")
        .evaluate((el, original) => el === original, originalDroplet),
    ).toBe(true);
  }
  await page.goBack();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("项目试用");
  await expect(page.getByRole("button", { name: "关闭导航" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("mobile menu animates both ways, survives route scrolling and dismisses on outside gestures or Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/discover");
  const nav = page.locator("#project-navigation");
  await expect(nav).toHaveAttribute("inert");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await expect
    .poll(() => nav.evaluate((el) => el.getAnimations().length))
    .toBeGreaterThan(0);
  const sample = () =>
    nav.evaluate((el) => {
      for (const animation of el.getAnimations()) {
        animation.pause();
        animation.currentTime =
          Number(animation.effect!.getTiming().duration) / 2;
      }
      return Number(getComputedStyle(el).opacity);
    });
  const opening = await sample();
  expect(opening).toBeGreaterThan(0);
  expect(opening).toBeLessThan(1);
  await nav.evaluate((el) =>
    el.getAnimations().forEach((animation) => animation.finish()),
  );
  await page.evaluate(() => {
    window.scrollTo(0, 100);
    window.dispatchEvent(new Event("scroll"));
  });
  await expect(nav).not.toHaveAttribute("inert");
  await page.getByRole("button", { name: "关闭导航", exact: true }).click();
  await expect(nav).toHaveAttribute("inert");
  const closing = await sample();
  expect(closing).toBeGreaterThan(0);
  expect(closing).toBeLessThan(1);
  // Reopen during the exit transition without unmounting the links.
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await expect(nav).not.toHaveAttribute("inert");
  await nav.getByRole("link", { name: "我的收藏", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "打开导航", exact: true }),
  ).toBeFocused();
  for (const event of ["pointerdown", "touchmove", "wheel"]) {
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page.locator("main").dispatchEvent(event);
    await expect(nav).toHaveAttribute("inert");
    await expect(
      page.getByRole("button", { name: "打开导航", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
  }
});

test("mobile filter and header icons are centered in visible 44px controls in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#/discover");
  for (const dark of [false, true]) {
    if (dark) await page.getByRole("button", { name: "切换深色主题" }).click();
    const controls = page.locator(
      ".site-tools .header-control, .filter-disclosure--icon > summary",
    );
    const geometry = await controls.evaluateAll((elements) =>
      elements.map((el) => {
        const control = el.getBoundingClientRect(),
          icon = el.querySelector("svg")!.getBoundingClientRect(),
          style = getComputedStyle(el);
        return {
          width: control.width,
          height: control.height,
          dx: Math.abs(control.x + control.width / 2 - icon.x - icon.width / 2),
          dy: Math.abs(
            control.y + control.height / 2 - icon.y - icon.height / 2,
          ),
          border: style.borderStyle,
          background: style.backgroundImage,
        };
      }),
    );
    expect(geometry).toHaveLength(3);
    for (const item of geometry) {
      expect(item.width).toBe(44);
      expect(item.height).toBe(44);
      expect(item.dx + item.dy).toBeLessThan(1);
      expect(item.border).toBe("solid");
      expect(item.background).not.toBe("none");
    }
  }
});

test("navigation stays still while one glass droplet travels, including interrupted clicks and bookmarks", async ({
  page,
}) => {
  await page.goto("/#/discover");
  await page.evaluate(() => document.fonts.ready);
  const nav = page.getByRole("navigation", { name: "主导航" });
  const droplet = nav.locator(".navigation-droplet");
  const originalDroplet = await droplet.elementHandle();
  const geometry = () =>
    page
      .locator(".site-header-inner, .site-navigation > a")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
  const original = await geometry();
  const start = (await droplet.boundingBox())!;
  await nav.getByRole("link", { name: "我的收藏", exact: true }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("我的收藏");
  await expect
    .poll(() => droplet.evaluate((el) => el.getAnimations().length))
    .toBe(1);
  const middle = await droplet.evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime =
      Number(animation.effect!.getTiming().duration) * 0.42;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return {
      x: el.getBoundingClientRect().x,
      scaleX: matrix.a,
      scaleY: matrix.d,
    };
  });
  const target = (await nav.locator('[href="#/saved"]').boundingBox())!;
  expect(middle.x).toBeGreaterThan(start.x + 10);
  expect(middle.x).toBeLessThan(target.x - 10);
  expect(middle.scaleX).toBeGreaterThan(1.1);
  expect(middle.scaleY).toBeLessThan(1);
  expect(await geometry()).toEqual(original);
  expect(
    await nav
      .locator(".selected")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");

  // Interrupt mid-flight: the new trip starts at the currently displayed position.
  await nav.getByRole("link", { name: "趋势与榜单" }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("趋势与榜单");
  const interrupted = await droplet.evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    return el.getBoundingClientRect().x;
  });
  expect(Math.abs(interrupted - middle.x)).toBeLessThan(1);

  for (const label of ["项目试用", "我的收藏", "发现项目"]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    expect(await geometry()).toEqual(original);
  }
  await expect
    .poll(() => droplet.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  expect(
    await droplet.evaluate((el, original) => el === original, originalDroplet),
  ).toBe(true);
  await page
    .getByRole("button", { name: `收藏 ${first.fullName}`, exact: true })
    .click();
  await expect(nav.locator(".navigation-count")).toHaveText("1");
  expect(await geometry()).toEqual(original);
  await page.goBack();
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute(
    "href",
    "#/saved",
  );
  await expect
    .poll(async () => {
      const selected = (await nav.locator(".selected").boundingBox())!;
      const glass = (await droplet.boundingBox())!;
      return (
        Math.abs(glass.x - selected.x) + Math.abs(glass.width - selected.width)
      );
    })
    .toBeLessThan(1);
  expect(await geometry()).toEqual(original);
});

test("navigation droplet realigns across breakpoints and respects reduced motion and keyboard navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/saved");
  const nav = page.getByRole("navigation", { name: "主导航" });
  for (const width of [821, 820, 768, 390, 360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const menu = page.getByRole("button", { name: "打开导航", exact: true });
    if (width <= 820 && (await menu.isVisible())) await menu.click();
    await expect(nav).toBeVisible();
    await expect
      .poll(async () => {
        const selected = (await nav.locator(".selected").boundingBox())!;
        const glass = (await nav.locator(".navigation-droplet").boundingBox())!;
        return (
          Math.abs(glass.x - selected.x) +
          Math.abs(glass.y - selected.y) +
          Math.abs(glass.width - selected.width)
        );
      })
      .toBeLessThan(1.5);
    const boxes = await nav.locator("a").evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, height: r.height };
      }),
    );
    expect(boxes.every((box) => box.left >= 0 && box.right <= width)).toBe(
      true,
    );
    expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
    if (width <= 820) expect(boxes[0].height).toBe(44);
  }
  const link = nav.getByRole("link", { name: "趋势与榜单" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(link).toHaveAttribute("aria-current", "page");
  expect(
    await nav
      .locator(".navigation-droplet")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  const selected = (await link.boundingBox())!;
  const glass = (await nav.locator(".navigation-droplet").boundingBox())!;
  expect(Math.abs(glass.x - selected.x)).toBeLessThan(1);
  await expect(link).toBeFocused();
});

test("quick reading is centered, switches projects, saves and restores position without a details page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("#project-browser .discovery-section-title"),
  ).toHaveCount(0);
  await expect(page.locator(".browse-info-panel")).not.toBeVisible();
  const trigger = page.getByRole("button", {
    name: `快速了解 ${first.fullName}`,
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  const originalScroll = await page.evaluate(() => scrollY);
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(
    2,
  );
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(
    2,
  );
  await expect(
    dialog.getByRole("button", { name: "打开项目详情", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.locator(".editorial-review, .related-articles"),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: first.name, exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".introduction-body > p")).toHaveCount(3);
  await expect(
    dialog.getByRole("heading", { name: "从这里开始", exact: true }),
  ).toBeAttached();
  await dialog.getByRole("button", { name: "下一个项目" }).click();
  await expect(
    dialog.getByRole("heading", { name: second.name, exact: true, level: 2 }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "收藏项目", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "已收藏", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(
    Math.abs((await page.evaluate(() => scrollY)) - originalScroll),
  ).toBeLessThan(3);
  await trigger.click();
  await expect(page).not.toHaveURL(/\/project\//);
  await page.keyboard.press("Escape");
  await page.locator(".gallery-title").first().click();
  await expect(dialog).toBeVisible();
  await expect(page).not.toHaveURL(/\/project\//);
  await expect(
    dialog.getByRole("link", { name: "GitHub", exact: true }),
  ).toHaveAttribute("href", first.url);
});

test("ordinary repository searches stay on the page and old details links open centered quick reading", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(2);
  const initialUrl = page.url();
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "全站项目搜索" }).fill(first.url);
  await page.getByRole("textbox", { name: "全站项目搜索" }).press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: first.name, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(initialUrl);
  await expect(page.locator(".project-detail")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto(`/#/project/${first.fullName}`);
  await expect(page).toHaveURL(/#\/discover$/);
  await expect(
    dialog.getByRole("heading", { name: first.name, exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await dialog.boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - 195)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height / 2 - 422)).toBeLessThan(2);
  await expect(
    dialog.getByRole("button", { name: "打开项目详情", exact: true }),
  ).toHaveCount(0);
});

test("only projects with a trial offer the details action in quick reading", async ({
  page,
}) => {
  await page.route("**/api/github/search?*", (route) =>
    route.fulfill({
      json: envelope({
        items: [raw(first), raw(example)],
        total_count: 2,
        incomplete_results: false,
      }),
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: `快速了解 ${first.fullName}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "打开项目详情", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "下一个项目" }).click();
  await dialog
    .getByRole("button", { name: "打开项目详情", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/project\/excalidraw\/excalidraw$/);
  await expect(
    page.getByRole("button", { name: "打开交互白板", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".editorial-review, .related-articles"),
  ).toHaveCount(0);
});

test("the shared homepage feature explains the whiteboard and opens its reading page", async ({
  page,
}) => {
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "精选项目试用" });
  await expect(carousel.locator(".trial-illustration")).toHaveAccessibleName(
    /Excalidraw 用途图.*图形和连线/,
  );
  await expect(
    page.getByRole("button", { name: "网页草图", exact: true }),
  ).toHaveCount(0);
  await carousel.locator(".trial-feature").click();
  await expect(page).toHaveURL(/#\/project\/excalidraw\/excalidraw$/);
  await expect(
    page.getByRole("region", { name: "README 中文转述", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('#hands-on [data-action="open-whiteboard"]'),
  ).toHaveCount(1);
});

test("an uncurated project uses the author's README", async ({ page }) => {
  const unknown = {
    ...first,
    id: "999001",
    owner: "example",
    name: "notes-app",
    fullName: "example/notes-app",
    description: "A small notes app.",
    tags: ["notes"],
    url: "https://github.com/example/notes-app",
  };
  await page.route("**/api/github/search?*", (route) =>
    route.fulfill({
      json: envelope({
        items: [raw(unknown)],
        total_count: 1,
        incomplete_results: false,
      }),
    }),
  );
  const authorText =
    "We built this application to keep plain text notes on your own device. You can create notebooks, search their contents, and export the files whenever you need them.";
  await page.route("**/api/github/repos/example/notes-app/readme", (route) =>
    route.fulfill({
      json: envelope({
        content: `# Notes\n\n${authorText}`,
        path: "README.md",
        html_url: unknown.url,
        truncated: false,
      }),
    }),
  );
  await page.goto("/");
  await expect(page.locator(".trend-card-author")).toHaveText("@example");
  await expect(page.locator(".trend-summary")).toContainText(
    "A small notes app.",
  );
  await expect(page.locator(".trend-card-cover")).toHaveCount(0);
  await page
    .getByRole("button", { name: "快速了解 example/notes-app", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".introduction-body"),
  ).toContainText(authorText);
  await expect(page.getByRole("dialog").locator(".intro-features")).toHaveCount(
    0,
  );
  await expect(page.getByRole("dialog").locator(".intro-source")).toContainText(
    "保留作者原文",
  );
});

test("a saved README is explicitly identified when GitHub is rate limited", async ({
  page,
}) => {
  await page.route(`**/api/github/repos/${example.fullName}/readme`, (route) =>
    route.fulfill({
      status: 429,
      json: { error: "GitHub 暂时限制了请求频率，请稍后再试。" },
    }),
  );
  await page.goto(`/#/project/${example.fullName}`);
  await page.getByRole("button", { name: "README 原文", exact: true }).click();
  await expect(page.locator(".readme-bottom")).toContainText("README 参考快照");
  await expect(page.locator(".markdown-body")).toContainText("Excalidraw");
});

test("cards show actual README media, omit absent or broken images, and keep the right image in quick read", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("observatory-view", JSON.stringify("list")),
  );
  const repositories = ["picture", "text", "broken"].map((name, index) => ({
    ...raw(first),
    id: 999900 + index,
    name,
    full_name: `media-fixture/${name}`,
    owner: { login: "media-fixture", avatar_url: "" },
    html_url: `https://github.com/media-fixture/${name}`,
  }));
  await page.route("**/api/github/search?*", (route) =>
    route.fulfill({
      json: envelope({
        items: repositories,
        total_count: 3,
        incomplete_results: false,
      }),
    }),
  );
  const requests: string[] = [];
  await page.route("**/api/observatory/project-media?*", (route) => {
    const fullName = new URL(route.request().url()).searchParams.get("repo")!;
    requests.push(fullName);
    const image = fullName.endsWith("/text")
      ? null
      : {
          url: fullName.endsWith("/broken")
            ? "/missing-project-image.webp"
            : "/project-media/rea.webp",
          alt: "项目实际界面",
          sourceUrl: `https://github.com/${fullName}#readme`,
        };
    return route.fulfill({ json: envelope({ image }) });
  });
  await page.route("**/missing-project-image.webp", (route) =>
    route.fulfill({ status: 404, body: "Missing" }),
  );
  await page.goto("/");
  const cards = page.locator(".project-card");
  await cards.nth(0).scrollIntoViewIfNeeded();
  await expect(cards.nth(0).locator(".trend-card-cover img")).toHaveAttribute(
    "src",
    "/project-media/rea.webp",
  );
  await expect(cards.nth(1).locator(".trend-card-cover")).toHaveCount(0);
  await expect(page.locator(".project-grid")).not.toHaveClass(/project-list/);
  const image = cards.nth(0).locator(".trend-card-cover");
  await expect
    .poll(async () => {
      const cover = await image.boundingBox();
      const heading = await cards
        .nth(0)
        .locator(".trend-card-heading")
        .boundingBox();
      return !!cover && !!heading && heading.y >= cover.y + cover.height;
    })
    .toBe(true);
  await cards.nth(2).scrollIntoViewIfNeeded();
  await expect.poll(() => requests.length).toBe(3);
  await expect(cards.nth(2).locator(".trend-card-cover")).toHaveCount(0);
  await expect(cards.nth(0).locator(".trend-card-cover img")).toHaveJSProperty(
    "complete",
    true,
  );
  const positions = () =>
    cards.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, bottom: rect.bottom, width: rect.width };
      }),
    );
  await expect
    .poll(async () => {
      const [picture, text, third] = await positions();
      return (
        Math.abs(third.y - text.bottom - 24) < 2 && third.y < picture.bottom
      );
    })
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const [picture, text, third] = await positions();
      return (
        Math.abs(picture.x - text.x) < 1 &&
        text.y >= picture.bottom &&
        third.y >= text.bottom
      );
    })
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await cards
    .nth(0)
    .getByRole("button", { name: "查看 picture 的项目配图", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".trend-card-cover img"),
  ).toHaveAttribute("src", "/project-media/rea.webp");
  await page.getByRole("button", { name: "下一个项目", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".trend-card-cover"),
  ).toHaveCount(0);
  expect(
    requests.filter((name) => name === "media-fixture/picture"),
  ).toHaveLength(1);
});

test("prepared local thumbnails render without metadata waterfalls and retain dimensions in quick read", async ({
  page,
}) => {
  const url = "/api/observatory/images/" + "a".repeat(64) + ".webp";
  const repositories = ["cached-picture", "text-only"].map((name, index) => ({
    ...raw(first),
    id: 999970 + index,
    name,
    full_name: `image-speed/${name}`,
    owner: { login: "image-speed", avatar_url: "" },
    media: {
      image: index
        ? null
        : {
            url,
            srcSet: `${url} 960w`,
            width: 960,
            height: 160,
            alt: "已缓存的界面截图",
            sourceUrl: "https://github.com/image-speed/cached-picture#readme",
          },
    },
  }));
  await page.route("**/api/github/search?*", (route) =>
    route.fulfill({
      json: envelope({
        items: repositories,
        total_count: 2,
        incomplete_results: false,
      }),
    }),
  );
  const thumbnail = await sharp({
    create: { width: 480, height: 80, channels: 3, background: "#567894" },
  })
    .webp()
    .toBuffer();
  await page.route("**/api/observatory/images/*.webp", (route) =>
    route.fulfill({ body: thumbnail, contentType: "image/webp" }),
  );
  const metadata: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/project-media?")) metadata.push(request.url());
  });
  await page.goto("/");
  const cards = page.locator(".project-card");
  await expect(cards).toHaveCount(2);
  await cards.first().scrollIntoViewIfNeeded();
  const cover = cards.first().locator(".trend-card-cover img");
  await expect(cover).toHaveAttribute("src", url);
  await expect(cover).toHaveAttribute("width", "960");
  await expect(cover).toHaveAttribute("height", "160");
  await expect(cover).toHaveAttribute("decoding", "async");
  await expect(cover).toHaveJSProperty("complete", true);
  await expect(cards.nth(1).locator(".trend-card-cover")).toHaveCount(0);
  await cards
    .first()
    .getByRole("button", { name: "查看 cached-picture 的项目配图" })
    .click();
  await expect(
    page.getByRole("dialog").locator(".trend-card-cover img"),
  ).toHaveAttribute("src", url);
  expect(metadata).toEqual([]);
});

test("frosted search keeps native controls, keyboard focus and reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator(".lens-search-material, canvas.lg-canvas"),
  ).toHaveCount(0);
  const search = page.getByRole("textbox", {
    name: "搜索 GitHub 公开项目",
    exact: true,
  });
  await search.fill("notes");
  const settings = page.getByRole("button", { name: "搜索设置", exact: true });
  await settings.click();
  await expect(page.getByRole("menu", { name: "搜索模式" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  const surface = await page.locator(".project-search").evaluate((element) => ({
    filter: getComputedStyle(element).backdropFilter,
    background: getComputedStyle(element).backgroundColor,
  }));
  expect(surface.filter).toContain("blur(");
  expect(surface.background).toMatch(/^rgba\(/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".project-search").hover();
  await expect
    .poll(() =>
      page
        .locator(".project-search")
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("none");
  await expect(search).toHaveValue("notes");
});

test("old stored list mode cannot override desktop two-column cards after refresh", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("observatory-view", JSON.stringify("list")),
  );
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(2);
  const columns = () =>
    page
      .locator(".project-grid")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      );
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(columns).toBe(2);
  }
  await page.reload();
  await expect.poll(columns).toBe(2);
  await expect(
    page.getByRole("button", { name: "列表视图", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(columns).toBe(1);
});

test("Liquid-Glass-HTML adapts filters to size, clears removed dialogs and respects transparency preferences", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.locator(".project-search");
  await expect(search).toHaveAttribute("data-lg-refraction", "surface");
  await expect(page.locator("svg[data-liquid-glass-html]")).toHaveCount(1);
  const dimensions = () =>
    search.evaluate((element) => {
      const id = element.style
        .getPropertyValue("--lg-refraction")
        .match(/#([^\"]+)/)?.[1];
      const filter = id ? document.getElementById(id) : null;
      return {
        width: Number(filter?.getAttribute("width")),
        actual: element.clientWidth + 2,
        map: filter
          ?.querySelector("feImage")
          ?.getAttribute("href")
          ?.startsWith("data:image/png"),
        scale: Number(
          filter?.querySelector("feDisplacementMap")?.getAttribute("scale"),
        ),
      };
    });
  await expect.poll(async () => (await dimensions()).map).toBe(true);
  expect((await dimensions()).scale).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const value = await dimensions();
      return Math.abs(value.width - value.actual);
    })
    .toBeLessThanOrEqual(1);
  await page
    .locator(".project-card")
    .first()
    .getByRole("button", { name: /快速了解/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-lg-refraction", "surface");
  await page.evaluate(() => {
    (
      window as unknown as { removedGlassDialog: Element | null }
    ).removedGlassDialog = document.querySelector(".dialog");
  });
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = (
          window as unknown as { removedGlassDialog: HTMLElement }
        ).removedGlassDialog;
        return [
          element.isConnected,
          element.hasAttribute("data-lg-refraction"),
          element.style.getPropertyValue("--lg-refraction"),
        ];
      }),
    )
    .toEqual([false, false, ""]);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect(search).toHaveAttribute("data-lg-refraction", "surface");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await expect(page.locator("[data-lg-refraction]")).toHaveCount(0);
  await expect(page.locator("svg[data-liquid-glass-html] filter")).toHaveCount(
    0,
  );
  await expect
    .poll(() => search.evaluate((e) => getComputedStyle(e).backdropFilter))
    .toBe("none");
  await session.send("Emulation.setEmulatedMedia", { features: [] });
  await expect(search).toHaveAttribute("data-lg-refraction", "surface");
  await session.detach();
});
