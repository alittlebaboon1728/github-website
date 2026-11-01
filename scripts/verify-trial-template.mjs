// Read and exercise the real saved Marked generation. This script never generates.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:5173";
const output = "docs/screenshots/trial-template";
await mkdir(output, { recursive: true });
const readTrial = async () =>
  (
    await (
      await fetch(`${base}/api/observatory/trials?repo=markedjs%2Fmarked`)
    ).json()
  ).data.trial;
const before = await readTrial();
if (before?.templateVersion !== "readable-trial-v1")
  throw new Error("请先生成 Marked 项目试用。");
const checks = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const dark of [false, true])
    for (const width of [390, 1440]) {
      const theme = dark ? "dark" : "light";
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await context.addInitScript((dark) => {
        if (window === window.top)
          localStorage.setItem("gh-design-dark", JSON.stringify(dark));
      }, dark);
      const page = await context.newPage();
      const errors = [],
        posts = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.method() === "POST") posts.push(request.url());
      });
      await page.goto(`${base}/#/trial/markedjs/marked`);
      const reading = page.getByRole("region", { name: "README 中文转述" });
      await expect(reading).toContainText(before.reading.introduction);
      await expect(page.locator(".trial-sandbox")).toHaveCount(0);
      await expect(
        page.locator(
          ".reader-copy h2, .reader-practice-heading h2, .trial-guide > h2",
        ),
      ).toHaveText(["项目介绍", "使用方法", "动手体验", "正式使用"]);
      await expect(page.locator('[data-action="open-trial"]')).toHaveCount(1);
      await expect(
        page.locator('#trial-hands-on [data-action="open-trial"]'),
      ).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${output}/marked-reading-${theme}-${width}.png`,
      });
      await page.locator("#trial-hands-on").evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 100 }));
      await page.screenshot({ path: `${output}/marked-steps-${theme}-${width}.png` });
      await page.getByRole("button", { name: "打开交互体验" }).click();
      const frame = page.frameLocator(".trial-sandbox");
      await expect(frame.locator("#preview strong")).toHaveText("Marked");
      await frame
        .getByLabel("Markdown 输入")
        .fill("# 本周更新\n\n修复了 **登录问题**。");
      await frame.getByRole("button", { name: "转换", exact: true }).click();
      await expect(frame.locator("#code")).toHaveText(
        "<h1>本周更新</h1>\n<p>修复了 <strong>登录问题</strong>。</p>",
      );
      await expect(frame.locator("#preview strong")).toHaveText("登录问题");
      await frame.getByLabel("Markdown 输入").fill("");
      await frame.getByRole("button", { name: "转换", exact: true }).click();
      await expect(frame.getByRole("status")).toContainText("请先输入");
      await expect(frame.locator("#code")).toBeEmpty();
      await frame
        .getByLabel("Markdown 输入")
        .fill('<img src="x" onerror="alert(1)">');
      await frame.getByRole("button", { name: "转换", exact: true }).click();
      await expect(frame.getByRole("status")).toContainText("不支持原始 HTML");
      await expect(frame.locator("#preview img")).toHaveCount(0);
      await frame.getByRole("button", { name: "重置", exact: true }).click();
      await expect(frame.locator("#preview strong")).toHaveText("Marked");
      await page.evaluate(() =>
        window.scrollTo({
          top:
            document.querySelector(".trial-workspace").getBoundingClientRect()
              .top +
            scrollY -
            100,
        }),
      );
      await page.waitForTimeout(350);
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      const exercise = await frame.locator("body").evaluate((body) => {
        const css = getComputedStyle(body.querySelector("button"));
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          filter: css.backdropFilter,
          color: css.backgroundColor,
          buttonHeight: body.querySelector("button").getBoundingClientRect()
            .height,
        };
      });
      expect(metrics.overflow).toBe(false);
      expect(exercise.overflow).toBe(false);
      expect(exercise.filter).toContain("blur(");
      expect(exercise.buttonHeight).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: `${output}/marked-exercise-${theme}-${width}.png`,
      });
      await page
        .getByRole("button", { name: dark ? "切换浅色主题" : "切换深色主题" })
        .click();
      await expect(frame.locator("html")).toHaveAttribute(
        "data-theme",
        dark ? "light" : "dark",
      );
      const changed = await frame
        .locator("button")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(changed).not.toBe(exercise.color);
      await page.reload();
      await expect(
        page.getByRole("region", { name: "README 中文转述" }),
      ).toBeVisible();
      await expect(page.locator(".trial-sandbox")).toHaveCount(0);
      await page.goto(`${base}/#/stories`);
      await page.locator(".trial-library-card").filter({ hasText: "markedjs/marked" }).click();
      await expect(page).toHaveURL(/#\/trial\/markedjs\/marked$/);
      await expect(page.getByRole("region", { name: "README 中文转述" })).toBeVisible();
      expect(posts).toEqual([]);
      expect(errors).toEqual([]);
      checks.push({
        theme,
        width,
        ...metrics,
        exercise,
        posts,
        errors,
        passed: true,
      });
      await context.close();
    }
  const after = await readTrial();
  expect(after.generatedAt).toBe(before.generatedAt);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      {
        repo: before.repo,
        model: before.model,
        templateVersion: before.templateVersion,
        generatedAt: before.generatedAt,
        cacheUnchanged: true,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      passed: checks.length,
      cacheUnchanged: true,
    }),
  );
} finally {
  await browser.close();
}
