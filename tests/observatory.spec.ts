import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Repository } from "../src/catalog";
const repositories = JSON.parse(
  readFileSync(
    new URL("../src/repository-snapshot.json", import.meta.url),
    "utf8",
  ),
).repositories as Repository[];
const project = repositories.find(
  (r) => r.fullName === "excalidraw/excalidraw",
)!;
const second = repositories.find(
  (r) => r.fullName === "public-apis/public-apis",
)!;
const at = "2026-10-31T06:00:00Z";
const envelope = (data: unknown) => ({ data, source: "live", fetchedAt: at });
function raw(repo: Repository) {
  return {
    id: Number(repo.id),
    owner: { login: repo.owner, avatar_url: repo.avatar },
    name: repo.name,
    full_name: repo.fullName,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stars,
    forks_count: repo.forks,
    pushed_at: repo.updated,
    topics: repo.tags,
    html_url: repo.url,
    homepage: repo.homepage,
    license: { spdx_id: repo.license },
    default_branch: repo.defaultBranch,
    created_at: repo.createdAt,
    open_issues_count: repo.openIssues,
    archived: false,
    private: false,
  };
}
const baseEvent = {
  id: "fixture-event",
  repo: project.fullName,
  type: "repository",
  text: "测试事件：创建公开仓库",
  url: project.url,
  occurredAt: at,
};
const trends = {
  repositories: [raw(project), raw(second)],
  query: "is:public archived:false stars:>1000",
  scope: "Fixture top-stars scope",
  total: 2,
  persistence: true,
  incomplete: false,
  growth: {
    ready: false,
    items: [],
    days: 7,
    startedAt: at,
    coverage: "相同范围内的 stars 净变化",
  },
};
async function mock(page: Page) {
  await page.route("**/api/github/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search"))
      return route.fulfill({
        json: envelope({
          items: [raw(project), raw(second)],
          total_count: 2,
          incomplete_results: false,
        }),
      });
    if (url.pathname.endsWith("/readme"))
      return route.fulfill({
        json: envelope({
          content:
            "# Test README\n\nThis document is a deterministic test fixture.",
          path: "README.md",
          truncated: false,
        }),
      });
    return route.fulfill({
      json: envelope(
        raw(url.pathname.includes(second.fullName) ? second : project),
      ),
    });
  });
  await page.route("**/api/observatory/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/pulse"))
      return route.fulfill({
        json: envelope({
          events: [baseEvent],
          bars: [],
          provider: "Fixture",
          fetchedAt: at,
          scope: "测试公开事件样本",
        }),
      });
    if (url.pathname.endsWith("/trends"))
      return route.fulfill({ json: envelope(trends) });
    return route.fulfill({
      status: 503,
      json: { error: "AI 搜索尚未配置。你可以切换到普通 GitHub 搜索。" },
    });
  });
}
async function chooseSearchMode(page: Page, name: string) {
  await page.getByRole("button", { name: "搜索设置", exact: true }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => mock(page));

test("search gear keeps the bar minimal, supports keyboard settings and preserves automatic repository navigation", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("search", { name: "项目搜索" });
  const input = search.getByRole("textbox", { name: "搜索 GitHub 公开项目" });
  const settings = search.getByRole("button", { name: "搜索设置" });
  await expect(search.getByRole("button")).toHaveCount(2);
  await expect(settings).toHaveAttribute("title", "搜索方式：自动识别");
  await input.fill("推荐几个适合个人用的开源笔记工具");
  await settings.click();
  await expect(
    page.getByRole("menuitemradio", { name: "自动识别", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "GitHub 搜索", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("推荐几个适合个人用的开源笔记工具");
  await expect(settings).toHaveAttribute("title", "搜索方式：GitHub 搜索");
  await settings.click();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await settings.click();
  await page.getByRole("heading", { name: /让好想法/ }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await search.getByRole("button", { name: "搜索项目", exact: true }).click();
  await expect(page).toHaveURL(/#\/discover\?q=/);
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.setViewportSize({ width: 360, height: 800 });
  await chooseSearchMode(page, "自动识别");
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill(project.url);
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .press("Enter");
  await expect(page).toHaveURL(new RegExp(`#/project/${project.fullName}$`));
});

test("natural language submission honestly degrades when AI is unconfigured; exact search still works", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill("推荐几个可以离线使用的中文笔记工具");
  await page.getByRole("button", { name: "搜索项目", exact: true }).click();
  await expect(page).toHaveURL(/#\/ask\?/);
  await expect(
    page.getByRole("heading", { name: "AI 搜索尚未配置", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".recommendation-item")).toHaveCount(0);
  await page.getByRole("button", { name: "改用 GitHub 搜索" }).click();
  await expect(page).toHaveURL(/#\/discover\?q=/);
  await page.getByRole("button", { name: "搜索设置", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "GitHub 搜索", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".project-card")).toHaveCount(2);
});

function aiResult(summary = "找一个开源画图工具") {
  return {
    plan: {
      summary,
      constraints: [
        { id: "drawing", label: "画图", level: "must" },
        { id: "offline", label: "离线", level: "prefer" },
      ],
      queries: ["whiteboard", "drawing"],
    },
    searched: 3,
    verified: 2,
    selections: [
      {
        repo: raw(project),
        purpose: "画图与讨论草稿",
        reason: "依据 README 的白板说明",
        evidence: "An open source virtual hand-drawn style whiteboard.",
        checks: [
          {
            id: "drawing",
            label: "画图",
            level: "must",
            status: "met",
            quote: "An open source virtual hand-drawn style whiteboard.",
          },
          {
            id: "offline",
            label: "离线",
            level: "prefer",
            status: "unknown",
            quote: null,
          },
        ],
        limitations: [{ text: "需要核对使用环境", unknown: true, quote: null }],
        sourceUrl: `${project.url}#readme`,
        fetchedAt: at,
        source: "live",
      },
    ],
  };
}
test("AI conditions and follow-ups remain local; leaving discards the chat while preserving favorites", async ({
  page,
}) => {
  const requests: {
    turns: string[];
    overrides: { id: string; level: string; label: string }[];
  }[] = [];
  await page.route("**/api/observatory/recommend", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: `${JSON.stringify({ type: "progress", message: "正在核对 README…" })}\n${JSON.stringify({ type: "result", ...envelope(aiResult()) })}\n`,
    });
  });
  await page.goto("/");
  await chooseSearchMode(page, "AI 需求搜索");
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill("我想找一个开源画图工具，最好离线");
  await page.getByRole("button", { name: "搜索项目", exact: true }).click();
  await expect(page.locator(".recommendation-item")).toHaveCount(1);
  await page.locator(".chat-condition-editor > summary").click();
  await page.getByRole("button", { name: "离线：偏好，改为必须" }).click();
  await expect.poll(() => requests.at(-1)?.overrides[0]?.level).toBe("must");
  await expect(page.locator(".recommendation-item")).toHaveCount(1);
  await page.getByRole("button", { name: "删除条件 离线" }).click();
  await expect.poll(() => requests.at(-1)?.overrides[0]?.level).toBe("remove");
  await expect(page.locator(".followup-form")).toBeVisible();
  await page.getByRole("textbox", { name: "继续对话" }).fill("只看 Windows");
  await page.getByRole("textbox", { name: "继续对话" }).press("Enter");
  await expect.poll(() => requests.at(-1)?.turns.length).toBe(2);
  expect(requests.at(-1)?.turns[1]).toContain("删除条件：离线");
  expect(requests.at(-1)?.turns[1]).toContain("只看 Windows");
  await expect(page.locator(".recommendation-item")).toHaveCount(2);
  const currentReply = page.locator(".chat-current-turn");
  await currentReply.getByText("查看原文依据与时间", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "核对 README 原文" }),
  ).toHaveAttribute("href", `${project.url}#readme`);
  await currentReply
    .getByRole("button", { name: `收藏 ${project.fullName}`, exact: true })
    .click();
  await currentReply
    .getByRole("button", { name: `快速了解 ${project.fullName}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "本站编辑评价" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "相关文章" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "打开项目详情", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await currentReply.locator(".recommendation-item .gallery-title").click();
  await expect(page).toHaveURL(/#\/project\//);
  const count = requests.length;
  await page.goBack();
  await expect(page.locator(".recommendation-item, .chat-turn")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "你想用开源，做点什么？" }),
  ).toBeVisible();
  expect(requests.length).toBe(count);
  await page
    .getByRole("textbox", { name: "描述你的需求" })
    .fill("我想找一个开源画图工具，最好离线");
  await page.getByRole("button", { name: "发送需求", exact: true }).click();
  await expect(page.locator(".chat-turn")).toHaveCount(1);
  expect(requests.at(-1)?.turns).toEqual(["我想找一个开源画图工具，最好离线"]);
  expect(requests.at(-1)?.overrides).toEqual([]);
  await expect(
    page.getByRole("button", {
      name: `取消收藏 ${project.fullName}`,
      exact: true,
    }),
  ).toBeVisible();
});

const pulseEvents = Array.from({ length: 12 }, (_, i) => ({
  ...baseEvent,
  id: `pulse-${i}`,
  text: `推送代码 #${i}`,
  url: `https://github.com/${project.fullName}/commit/${String(i).padStart(40, "a")}`,
}));
const pulseFixture = {
  events: pulseEvents,
  bars: [
    { at, count: 25 },
    { at: "2026-10-31T06:00:05Z", count: 40 },
  ],
  provider: "OSSInsight",
  fetchedAt: at,
  scope: "测试公开活动样本，不是 commit 总数",
};

test("pulse cycles direct GitHub links and pauses for interaction, explicit pause and offscreen", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/observatory/pulse", (route) => {
    calls++;
    return route.fulfill({ json: envelope(pulseFixture) });
  });
  await page.goto("/");
  const pulse = page.locator(".gh-pulse");
  await pulse.scrollIntoViewIfNeeded();
  await expect(pulse.locator(".gh-pulse-event")).toHaveCount(6);
  await expect(
    pulse.getByRole("group", { name: /公开活动柱图/ }),
  ).toHaveAttribute("aria-label", /共 65 次事件/);
  const first = pulse.locator(".gh-pulse-event").first();
  await expect(first).toHaveAttribute("href", pulseEvents[6].url);
  await expect(first).toHaveAttribute("target", "_blank");
  await page.mouse.move(0, 0);
  await page.clock.runFor(1900);
  await expect(first).toHaveAttribute("href", pulseEvents[5].url);
  await first.hover();
  await page.clock.runFor(4000);
  await expect(first).toHaveAttribute("href", pulseEvents[5].url);
  await first.focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(4000);
  await expect(first).toHaveAttribute("href", pulseEvents[5].url);
  await pulse.getByRole("button", { name: "暂停动态", exact: true }).click();
  await page.mouse.move(0, 0);
  const initialCalls = calls;
  await page.clock.runFor(76_000);
  expect(calls).toBe(initialCalls);
  await expect(first).toHaveAttribute("href", pulseEvents[5].url);
  await pulse.getByRole("button", { name: "播放动态", exact: true }).click();
  await page.mouse.move(0, 0);
  await page.clock.runFor(1900);
  await expect(first).toHaveAttribute("href", pulseEvents[4].url);
  await page.clock.runFor(76_000);
  await expect.poll(() => calls).toBeGreaterThan(initialCalls);
  await page.locator(".observatory-footer").scrollIntoViewIfNeeded();
  const offscreenCalls = calls;
  await page.clock.runFor(76_000);
  expect(calls).toBe(offscreenCalls);
});

test("pulse honors reduced motion, refreshes new batches and recovers from failure", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  let failed = true;
  await page.route("**/api/observatory/pulse", (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: "offline" } })
      : route.fulfill({ json: envelope(pulseFixture) }),
  );
  await page.goto("/");
  const pulse = page.locator(".gh-pulse");
  await pulse.scrollIntoViewIfNeeded();
  await expect(pulse.getByRole("status")).toHaveText(/动态暂不可用/);
  failed = false;
  await pulse.getByRole("button", { name: "刷新近期动态" }).click();
  await expect(pulse.locator(".gh-pulse-event")).toHaveCount(6);
  await expect(
    pulse.getByRole("button", { name: "播放动态", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await page.clock.runFor(4000);
  await expect(pulse.locator(".gh-pulse-event").first()).toHaveAttribute(
    "href",
    pulseEvents[6].url,
  );
  await pulse.getByLabel("数据来源说明").click();
  await expect(
    pulse.getByText("测试公开活动样本，不是 commit 总数"),
  ).toBeVisible();
});

test("pulse chart drifts, morphs fresh data in place and exposes hover, touch and keyboard details", async ({
  page,
}) => {
  let updated = false;
  await page.route("**/api/observatory/pulse", (route) =>
    route.fulfill({
      json: envelope({
        ...pulseFixture,
        bars: updated
          ? [
              { at: "2026-10-31T06:01:00Z", count: 10 },
              { at: "2026-10-31T06:01:05Z", count: 1000 },
            ]
          : pulseFixture.bars,
      }),
    }),
  );
  await page.goto("/");
  const pulse = page.locator(".gh-pulse");
  await pulse.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const chart = pulse.getByRole("group", { name: /公开活动柱图/ });
  const track = chart.locator(".gh-pulse-bars");
  await expect
    .poll(() =>
      track.evaluate(async (element) => {
        const animation = element.getAnimations()[0];
        if (!animation || animation.playState !== "running") return false;
        const before = Number(animation.currentTime);
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return Number(animation.currentTime) > before;
      }),
    )
    .toBe(true);
  const first = chart.locator(".gh-pulse-bar-slot").first();
  await chart.hover();
  await first.hover();
  const tooltip = chart.getByRole("tooltip");
  await expect(tooltip).toContainText("25");
  await expect(tooltip).toContainText("5 秒采样");
  await expect(track).toHaveCSS("animation-play-state", "paused");
  const bounds = await tooltip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(tooltip).toContainText("25");
  await page.keyboard.press("ArrowRight");
  await expect(tooltip).toContainText("40");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);

  // Changed timestamps must retain the existing bar and its animated scale.
  await page.keyboard.press("Tab");
  await page.mouse.move(0, 0);
  await expect
    .poll(() =>
      first
        .locator(".gh-pulse-bar")
        .evaluate(
          (element) => new DOMMatrix(getComputedStyle(element).transform).d,
        ),
    )
    .toBeCloseTo(0.625, 2);
  const originalBar = await first.locator(".gh-pulse-bar").elementHandle();
  updated = true;
  await pulse.getByRole("button", { name: "刷新近期动态" }).click();
  await page.mouse.move(0, 0);
  await expect(chart).toHaveAttribute("aria-label", /共 1010 次事件/);
  expect(
    await originalBar!.evaluate(
      (element) => element === document.querySelector(".gh-pulse-bar"),
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      originalBar!.evaluate((element) => {
        const scale = new DOMMatrix(getComputedStyle(element).transform).d;
        return scale > 0.01 && scale < 0.62;
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      originalBar!.evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).d,
      ),
    )
    .toBeCloseTo(0.01, 2);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chart.scrollIntoViewIfNeeded();
  await first.dispatchEvent("pointerdown", { pointerType: "touch" });
  await expect(tooltip).toContainText("10");
  const mobileBounds = await tooltip.boundingBox();
  expect(mobileBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds!.x + mobileBounds!.width).toBeLessThanOrEqual(360);
  await expect(track).toHaveCSS("animation-name", "none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("blog module is removed from navigation and home, and old page links fall back to discovery", async ({
  page,
}) => {
  const feedRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/blogs"))
      feedRequests.push(request.url());
  });
  await page.goto("/#/discover");
  await expect(page.locator(".project-card").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "博客", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".blog-section, .article-list")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "博客", exact: true }),
  ).toHaveCount(0);
  await page.goto("/#/blogs");
  await expect(page.locator(".project-card").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "开源博客" })).toHaveCount(0);
  expect(feedRequests).toEqual([]);
});

test("rankings distinguish cumulative stars from real historical changes and insufficient history", async ({
  page,
}) => {
  await page.goto("/#/trends");
  await expect(page.locator(".ranking-row")).toHaveCount(2);
  await page.getByRole("button", { name: "热门趋势", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "正在积累数据", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".star-sparkline")).toHaveCount(0);
  await page.route("**/api/observatory/trends?**", (route) =>
    route.fulfill({
      json: envelope({
        ...trends,
        growth: {
          ...trends.growth,
          ready: true,
          from: "2026-10-24T06:00:00Z",
          to: at,
          items: [
            {
              repo: raw(project),
              delta: 10,
              points: [
                { at: "2026-10-24T06:00:00Z", stars: project.stars - 10 },
                { at, stars: project.stars },
              ],
            },
          ],
        },
      }),
    }),
  );
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(page.locator(".ranking-metric")).toContainText("+10");
  await expect(page.locator(".star-sparkline")).toHaveCount(1);
  await page.getByText("数据范围与计算方式", { exact: true }).click();
  await expect(page.getByText("实际比较", { exact: false })).toContainText(
    "2026/10/24",
  );
  await page
    .getByRole("button", {
      name: `收藏榜单项目 ${project.fullName}`,
      exact: true,
    })
    .click();
  await page.locator(".ranking-project button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("趋势窗口").selectOption("30");
  await expect(page).toHaveURL(/days=30/);
});

test("new pages, mobile menu and quick reading fit all target sizes in both themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const dark of [false, true]) {
    await page.goto("/");
    await page.evaluate(
      (value) => localStorage.setItem("gh-design-dark", JSON.stringify(value)),
      dark,
    );
    await page.reload();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/discover", "/trends"]) {
        await page.goto(`/#${path}`);
        await expect(page.locator(".page-loader")).toHaveCount(0);
        if (path === "/discover") {
          await expect(
            page.getByRole("heading", { name: /让好想法/ }),
          ).toBeVisible();
          await expect(page.locator(".trends-section")).toHaveCount(0);
          await expect(page.locator(".spotlight-topics")).toHaveCount(0);
        } else {
          await expect(
            page.getByRole("heading", { name: "趋势与榜单", exact: true }),
          ).toBeVisible();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${width}, dark=${dark}, ${path}`,
        ).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "打开导航" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "趋势与榜单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "趋势与榜单", exact: true }),
  ).toBeVisible();
  await page.getByText("筛选榜单范围", { exact: true }).click();
  await expect(page.getByLabel("榜单语言")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByLabel("榜单语言")).toBeVisible();
});

test("cancelling a pending AI request keeps later exact search results intact", async ({
  page,
}) => {
  let pending = false;
  await page.route("**/api/observatory/recommend", async (route) => {
    pending = true;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route
      .fulfill({
        contentType: "application/x-ndjson",
        body: `${JSON.stringify({ type: "result", ...envelope(aiResult()) })}\n`,
      })
      .catch(() => {});
  });
  await page.goto("/");
  await chooseSearchMode(page, "AI 需求搜索");
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill("我想找开源画图工具");
  await page.getByRole("button", { name: "搜索项目", exact: true }).click();
  await expect.poll(() => pending).toBe(true);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已取消本次检索" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回项目发现", exact: true }).click();
  await chooseSearchMode(page, "GitHub 搜索");
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill("database");
  await page.getByRole("button", { name: "搜索项目", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(page.locator(".recommendation-item")).toHaveCount(0);
  await expect(page).toHaveURL(/q=database/);
});

test("browser back restores discovery filters, result set and reading position", async ({
  page,
}) => {
  let searches = 0;
  await page.route("**/api/github/search?**", (route) => {
    searches++;
    return route.fulfill({
      json: envelope({
        items: [raw(project), raw(second)],
        total_count: 2,
        incomplete_results: false,
      }),
    });
  });
  await page.goto("/#/discover?q=drawing");
  await page.getByLabel("按编程语言筛选").selectOption("TypeScript");
  await page.getByLabel("项目排序").selectOption("updated");
  await page
    .getByRole("group", { name: "按用途浏览" })
    .getByRole("button", { name: "设计与创意" })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(page.locator("#project-browser")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.locator(".gallery-title").first().scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  const before = searches;
  await page.locator(".gallery-title").first().click();
  await expect(page).toHaveURL(/#\/project\//);
  await page.goBack();
  await expect(page.getByLabel("按编程语言筛选")).toHaveValue("TypeScript");
  await expect(page.getByLabel("项目排序")).toHaveValue("updated");
  await expect(
    page
      .getByRole("group", { name: "按用途浏览" })
      .getByRole("button", { name: "设计与创意" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".project-card")).toHaveCount(2);
  expect(searches).toBe(before);
  expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(
    5,
  );
});
