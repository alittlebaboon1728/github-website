import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  content,
  repository,
  document as source,
  ready,
  catalog,
  trial,
} from "./fixtures/trials.mjs";
const envelope = (data: unknown) => ({
  data,
  source: "live",
  fetchedAt: "2026-11-01T04:00:00Z",
});
async function base(page: Page) {
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({ json: envelope({ cardGeneration: false }) });
    if (path.endsWith("/project-media"))
      return route.fulfill({ json: envelope({ image: null }) });
    return route.fulfill({
      status: 503,
      json: { error: "测试中不启用这个服务。" },
    });
  });
  await page.route("**/api/github/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const raw = {
      ...repository,
      owner: { login: "sample", avatar_url: "" },
      html_url: "https://github.com/sample/notebook",
      stargazers_count: 120,
      forks_count: 10,
      default_branch: "main",
      language: "TypeScript",
      pushed_at: null,
      created_at: null,
      open_issues_count: 0,
      topics: [],
    };
    return route.fulfill({
      json: envelope(
        path.endsWith("/readme")
          ? source.data
          : path.endsWith("/search")
            ? { items: [raw], total_count: 1, incomplete_results: false }
            : raw,
      ),
    });
  });
}
test.beforeEach(async ({ page }) => base(page));

test("quick reading starts generation only on click; the result survives refresh and is reachable from the trial library", async ({
  page,
}) => {
  let posts = 0,
    generated = false;
  await page.route("**/api/observatory/trials**", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      generated = true;
      expect(route.request().postDataJSON()).toEqual({
        repo: repository.full_name,
      });
    }
    const isList =
      !new URL(route.request().url()).searchParams.has("repo") &&
      route.request().method() !== "POST";
    return route.fulfill({
      json: envelope(
        isList ? catalog : generated ? ready : { ...ready, trial: null },
      ),
    });
  });
  await page.goto("/#/project/sample/notebook");
  const dialog = page.getByRole("dialog", { name: "notebook 快速了解" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "生成项目试用" }),
  ).toBeVisible();
  expect(posts).toBe(0);
  await dialog.getByRole("button", { name: "生成项目试用" }).click();
  await expect(page).toHaveURL(/#\/trial\/sample\/notebook$/);
  await expect(
    page.getByRole("region", { name: "README 中文转述" }),
  ).toContainText(content.reading.introduction);
  await expect(page.locator(".trial-sandbox")).toHaveCount(0);
  await expect(page.locator('[data-action="open-trial"]')).toHaveCount(1);
  await expect(
    page.locator('#trial-hands-on [data-action="open-trial"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "打开交互体验" }).click();
  await expect(page.locator(".trial-sandbox")).toBeVisible();
  expect(posts).toBe(1);
  await page.reload();
  await expect(page.locator(".trial-sandbox")).toHaveCount(0);
  await page.getByRole("button", { name: "打开交互体验" }).click();
  await expect(page.locator(".trial-sandbox")).toBeVisible();
  expect(posts).toBe(1);
  await page
    .getByRole("link", { name: "项目试用", exact: true })
    .last()
    .click();
  await expect(page.locator(".trial-library-card")).toHaveCount(1);
  await page.locator(".trial-library-card").click();
  await expect(
    page.getByRole("heading", { name: "notebook", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
});

test("generated exercise really works, resets, and cannot access the parent, local storage or network", async ({
  page,
}) => {
  await page.route("**/api/observatory/trials**", (route) =>
    route.fulfill({ json: envelope(ready) }),
  );
  await page.goto("/#/trial/sample/notebook");
  await page.getByRole("button", { name: "打开交互体验" }).click();
  const frame = page.frameLocator(".trial-sandbox");
  await frame.getByLabel("笔记内容").fill("我的第一条笔记");
  await frame.getByRole("button", { name: "添加笔记" }).click();
  await expect(frame.getByRole("listitem")).toHaveText("我的第一条笔记");
  const frameObject = page.frames().find((f) => f.parentFrame());
  expect(frameObject).toBeTruthy();
  const isolation = await frameObject!.evaluate(async () => {
    let parentDenied = false,
      storageDenied = false,
      networkDenied = false;
    try {
      void window.parent.document.body;
    } catch {
      parentDenied = true;
    }
    try {
      void localStorage.length;
    } catch {
      storageDenied = true;
    }
    try {
      await fetch("https://blocked.invalid/check");
    } catch {
      networkDenied = true;
    }
    return { parentDenied, storageDenied, networkDenied };
  });
  expect(isolation).toEqual({
    parentDenied: true,
    storageDenied: true,
    networkDenied: true,
  });
  await expect(page.locator(".reader-steps h3")).toHaveText(
    content.steps.map((step) => step.title),
  );
  await expect(page.locator(".reader-step-result")).toHaveCount(3);
  await expect(page.locator('[data-action="open-trial"]')).toHaveCount(1);
  for (const heading of ["项目介绍", "使用方法", "动手体验", "正式使用"])
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toHaveCount(1);
  await page.getByRole("button", { name: "重置教学演示" }).click();
  await expect(frame.getByRole("listitem")).toHaveCount(0);
});

test("flow and source-linked video experiences fit mobile in both themes and expose working navigation", async ({
  page,
}) => {
  let kind = "flow";
  const nodes = [
    { title: "准备数据", detail: "先整理一份示例资料。" },
    { title: "处理内容", detail: "把内容按规则分类。" },
    { title: "查看结果", detail: "检查整理后的资料。" },
  ];
  await page.route("**/api/observatory/trials**", (route) =>
    route.fulfill({
      json: envelope({
        ...ready,
        trial: {
          ...trial,
          experience: {
            kind,
            title: "一步步理解工作流",
            description: "点击节点探索。",
            nodes,
            url: "https://example.com/notebook",
          },
        },
      }),
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/trial/sample/notebook");
  await page.getByRole("button", { name: "查看使用流程" }).click();
  await page.getByRole("button", { name: "2 处理内容" }).click();
  await expect(page.locator(".trial-flow-detail")).toContainText(
    nodes[1].detail,
  );
  for (let i = 0; i < 2; i++) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: i === 0 ? "切换深色主题" : "切换浅色主题" })
      .click();
  }
  kind = "video";
  await page.reload();
  await expect(
    page.getByRole("link", { name: "打开项目视频" }),
  ).toHaveAttribute("href", "https://example.com/notebook");
  await expect(page.locator(".trial-sandbox")).toHaveCount(0);
});

test("pending generation resumes via GET after reload; failed regeneration keeps the usable result", async ({
  page,
}) => {
  let posts = 0,
    fail = false;
  const job = {
    id: "job",
    repo: repository.full_name,
    state: "running",
    stage: "GPT 正在设计使用说明与试用体验",
    startedAt: "2026-11-01T04:00:00Z",
  };
  await page.route("**/api/observatory/trials**", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().postDataJSON().regenerate).toBe(true);
    }
    return route.fulfill({
      json: envelope({
        ...ready,
        job: {
          ...job,
          ...(fail ? { state: "error", error: "生成服务暂时不可用" } : {}),
        },
      }),
    });
  });
  await page.goto("/#/trial/sample/notebook");
  await expect(page.locator(".trial-generating")).toContainText(job.stage);
  await page.reload();
  await expect(page.locator(".trial-generating")).toContainText(job.stage);
  expect(posts).toBe(0);
  fail = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("生成服务暂时不可用");
  await page.getByRole("button", { name: "打开交互体验" }).click();
  await expect(page.locator(".trial-sandbox")).toBeVisible();
  await page.getByRole("button", { name: "重试生成" }).click();
  expect(posts).toBe(1);
  await expect(page.locator(".trial-sandbox")).toBeVisible();
});

test("older saved trials keep readable content without requesting generation", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/api/observatory/trials**", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({
      json: envelope({ ...ready, trial: { ...trial, reading: undefined } }),
    });
  });
  await page.goto("/#/trial/sample/notebook");
  await expect(
    page.getByRole("region", { name: "README 中文转述" }),
  ).toContainText(trial.summary);
  await expect(
    page.getByRole("region", { name: "README 中文转述" }),
  ).toContainText(trial.guide[0].body);
  await page.getByRole("button", { name: "打开交互体验" }).click();
  await expect(page.locator(".trial-sandbox")).toBeVisible();
  expect(posts).toBe(0);
});

test("unconfigured generation has a clear state and opening the page does not submit", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/api/observatory/trials**", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({
      json: envelope({ ...ready, configured: false, trial: null }),
    });
  });
  await page.goto("/#/trial/sample/notebook");
  await expect(
    page.getByRole("button", { name: "生成项目试用" }),
  ).toBeDisabled();
  await expect(
    page.getByText("试用生成服务尚未配置，已有体验仍可使用。"),
  ).toBeVisible();
  expect(posts).toBe(0);
});
