import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import categories from "../shared/discovery-categories.json" with { type: "json" };

function fixture() {
  return {
    token: "fixture-session",
    server: {
      startedAt: "2026-11-02T00:00:00Z",
      uptime: 3860,
      pid: 1234,
      node: "v24.0.0",
      memoryBytes: 140_000_000,
    },
    models: {
      cards: { configured: true, name: "deepseek-flash" },
      trials: { configured: true, name: "trial-model" },
    },
    storage: {
      enabled: true,
      directory: "G:\\github_website\\.data-lan",
      files: 726,
      bytes: 13_000_000,
      cards: 686,
      pages: 21,
      trials: 4,
      checkedAt: Date.now(),
    },
    library: {
      enabled: true,
      running: true,
      current: null,
      refreshMs: 1800_000,
      scopes: categories.map((category) => ({
        q: category.query,
        sort: "stars",
        pages: 3,
        defaultScope: true,
        prepared: [1, 2, 3].map((number) => ({
          page: number,
          ready: 12,
          pending: 0,
          complete: true,
          updatedAt: Date.now(),
          nextAt: Date.now() + 100_000,
        })),
      })),
    },
  };
}
async function setup(page: Page) {
  const data = fixture();
  const posts: Record<string, unknown>[] = [];
  let failed = false,
    reads = 0;
  await page.route("**/api/admin/status", (route) => {
    reads++;
    return failed
      ? route.fulfill({ status: 503, json: { error: "本机服务暂时不可用。" } })
      : route.fulfill({ json: { data, fetchedAt: new Date().toISOString() } });
  });
  await page.route("**/api/admin/library", (route) => {
    expect(route.request().headers()["x-admin-token"]).toBe("fixture-session");
    const body = route.request().postDataJSON();
    posts.push(body);
    if (body.action === "pause") data.library.running = false;
    if (body.action === "resume") data.library.running = true;
    return route.fulfill({
      status: 202,
      json: {
        data: {
          running: data.library.running,
          queued: body.scope ? 3 : 18,
          deferred: 0,
        },
      },
    });
  });
  return {
    data,
    posts,
    fail: (value: boolean) => (failed = value),
    reads: () => reads,
  };
}

test("admin shows actual storage and progress, filters scopes, and only submits actions after clicks", async ({
  page,
}) => {
  const { posts } = await setup(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "网站运行与缓存" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "运行概览" })).toContainText(
    "686",
  );
  await expect(
    page.getByRole("table", { name: "分类预热进度" }).getByRole("row"),
  ).toHaveCount(7);
  expect(posts).toEqual([]);
  await page.getByLabel("查找分类或关键词").fill("数据");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "更新数据与后端", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("已安排 3 页更新");
  expect(posts).toEqual([
    { action: "refresh", scope: { q: "topic:database", sort: "stars" } },
  ]);
  await page.getByRole("button", { name: "暂停后台更新", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "恢复后台更新", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "恢复后台更新", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停后台更新", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "更新全部范围", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已安排 18 页更新");
  await expect(page.locator(".admin-commands")).toContainText(
    "npm run lan:start",
  );
});

test("admin retains last readable status on failure, supports recovery and pauses automatic reads", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/admin/");
  await expect(page.locator(".admin-metrics")).toContainText("686");
  await page.getByLabel("每 5 秒自动读取").uncheck();
  state.fail(true);
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("保留上一次读取的数据");
  await expect(page.locator(".admin-metrics")).toContainText("686");
  state.fail(false);
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const initial = state.reads();
  await page.clock.install();
  await page.clock.fastForward(12_000);
  expect(state.reads()).toBe(initial);
  expect(state.posts).toEqual([]);
});

test("admin shows action errors and prevents duplicate submissions while a command is pending", async ({
  page,
}) => {
  const { posts } = await setup(page);
  let release: (() => void) | undefined;
  await page.route("**/api/admin/library", async (route) => {
    posts.push(route.request().postDataJSON());
    await new Promise<void>((resolve) => (release = resolve));
    await route.fulfill({
      status: 403,
      json: { error: "后台会话已更新，请刷新页面后再操作。" },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "更新全部范围", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停后台更新", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "更新全部范围", exact: true }),
  ).toBeDisabled();
  expect(posts).toHaveLength(1);
  release!();
  await expect(page.getByRole("alert")).toContainText("后台会话已更新");
  await expect(
    page.getByRole("button", { name: "更新全部范围", exact: true }),
  ).toBeEnabled();
});

test("admin fits mobile and desktop in both themes, exposes page details and accessible controls", async ({
  page,
}) => {
  const state = await setup(page);
  state.data.library.scopes[5].prepared[2] = {
    ...state.data.library.scopes[5].prepared[2],
    complete: false,
    ready: 8,
    pending: 4,
  };
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/admin.html");
    await expect(page.locator(".admin-metrics")).toContainText("686");
    await page.getByLabel("每 5 秒自动读取").uncheck();
    await page.getByLabel("仅看未完成或异常").check();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(
      width < 650 ? 1 : 2,
    );
    await page.locator(".admin-page-progress summary").click();
    await expect(page.getByText("第 3 页：8 张就绪，4 张待补齐")).toBeVisible();
    for (const dark of [false, true]) {
      if (
        (await page.locator("html").getAttribute("data-theme")) !==
        (dark ? "dark" : "light")
      )
        await page
          .getByRole("button", { name: dark ? "切换深色主题" : "切换浅色主题" })
          .click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow).toBe(false);
      await expect(
        page.getByRole("button", { name: "更新数据与后端", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "打开网站" }),
      ).toHaveAttribute("target", "_blank");
    }
  }
});

test("admin unavailable state keeps start commands visible and unconfigured controls remain disabled", async ({
  page,
}) => {
  const state = await setup(page);
  state.fail(true);
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText("本机服务暂时不可用");
  await expect(page.getByRole("heading", { name: "运行命令" })).toBeVisible();
  state.fail(false);
  state.data.library.enabled = false;
  state.data.models.cards.configured = false;
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "更新全部范围", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "暂停后台更新", exact: true }),
  ).toBeDisabled();
  expect(state.posts).toEqual([]);
});
