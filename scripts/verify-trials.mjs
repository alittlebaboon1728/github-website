import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:5173";
const output = new URL("../docs/screenshots/trials/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const theme of ["light", "dark"]) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await context.addInitScript((dark) => {
        if (window === window.top)
          localStorage.setItem("gh-design-dark", JSON.stringify(dark));
      }, theme === "dark");
      const page = await context.newPage();
      const errors = [];
      let posts = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/observatory/"))
          posts++;
      });
      for (const [name, route, selector] of [
        ["library", "/#/stories", '[aria-hidden="false"] .trial-feature'],
        ["generated", "/#/trial/excalidraw/excalidraw", ".trial-sandbox"],
        ["whiteboard", "/#/project/excalidraw/excalidraw", ".reader-copy"],
      ]) {
        errors.length = 0;
        await page.goto(`${base}${route}`);
        if (name === "generated")
          await page.getByRole("button", { name: "打开交互体验" }).click();
        await page.locator(selector).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          contentWidth: document.documentElement.scrollWidth,
        }));
        let frameMetrics;
        if (name === "generated") {
          const frame = page.frames().find((f) => f.parentFrame());
          frameMetrics = await frame.evaluate(() => ({
            width: innerWidth,
            contentWidth: document.documentElement.scrollWidth,
            height: innerHeight,
            bodyHeight: document.body.scrollHeight,
          }));
        }
        await page.screenshot({
          path: new URL(
            `${name}-${theme}-${width}.png`,
            output,
          ).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
          fullPage: true,
        });
        const passed =
          metrics.contentWidth <= metrics.width &&
          (!frameMetrics || frameMetrics.contentWidth <= frameMetrics.width) &&
          !errors.length &&
          posts === 0;
        results.push({
          name,
          theme,
          ...metrics,
          frameMetrics,
          errors: [...errors],
          posts,
          passed,
        });
      }
      await context.close();
    }
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  await page.goto(`${base}/#/trial/excalidraw/excalidraw`);
  await page.getByRole("button", { name: "打开交互体验" }).click();
  const frame = page.frameLocator(".trial-sandbox");
  await frame
    .getByRole("button", { name: "放入示例节点", exact: true })
    .click();
  await frame.getByRole("button", { name: "连接流程", exact: true }).click();
  await frame.getByLabel("节点文字（最多 8 字）").fill("评审方案");
  await frame.getByRole("button", { name: "应用文字", exact: true }).click();
  await frame
    .getByRole("button", { name: "移动中间节点", exact: true })
    .click();
  const canvas = frame.locator("#canvas");
  const modified =
    (await canvas.getAttribute("aria-label")).includes("评审方案") &&
    (await canvas.getAttribute("aria-label")).includes("右移动");
  await frame.getByRole("button", { name: "撤销", exact: true }).click();
  const undone = !(await canvas.getAttribute("aria-label")).includes("右移动");
  await page.screenshot({
    path: new URL("generated-interaction.png", output).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
    fullPage: true,
  });
  results.push({
    name: "live-generated-interaction",
    modified,
    undone,
    passed: modified && undone,
  });
  await page.goto(`${base}/#/trial/jqlang/jq`);
  await page.getByRole("button", { name: "打开交互体验" }).click();
  await expect(page.locator(".trial-sandbox")).toBeVisible();
  const jq = page.frameLocator(".trial-sandbox");
  await jq.getByRole("button", { name: "提取版本号", exact: true }).click();
  await expect(jq.locator("#output")).toHaveText('"1.4.2"');
  const jqWorking = true;
  await jq.getByLabel("选择示例").selectOption("missing");
  await jq.getByRole("button", { name: "提取版本号", exact: true }).click();
  await expect(jq.locator("#output")).toHaveText("null");
  const jqMissing = true;
  await page.evaluate(() => {
    document.activeElement instanceof HTMLElement &&
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: new URL("jq-interaction.png", output).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
    fullPage: true,
  });
  results.push({
    name: "live-jq-interaction",
    jqWorking,
    jqMissing,
    passed: jqWorking && jqMissing,
  });
  await page.route("**/api/observatory/status", (route) =>
    route.fulfill({ json: { data: { cardGeneration: false } } }),
  );
  await page.route("**/api/github/search?**", (route) =>
    route.fulfill({
      json: {
        data: { items: [], total_count: 0, incomplete_results: false },
        source: "live",
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/#/stories`);
    await page.goto(`${base}/#/project/jqlang/jq`);
    await page.locator(".quick-trial-launch").waitFor();
    await page.locator(".quick-trial-launch").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: new URL(`quick-read-${width}.png`, output).pathname.replace(
        /^\/([A-Za-z]:)/,
        "$1",
      ),
    });
    const fits = await page.evaluate(() => {
      const r = document
        .querySelector(".quick-trial-launch")
        .getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        document.documentElement.scrollWidth <= innerWidth
      );
    });
    results.push({ name: "quick-read", width, passed: fits });
  }
  await context.close();
} finally {
  await browser.close();
  await writeFile(
    new URL("checks.json", output),
    JSON.stringify(results, null, 2),
  );
}
console.log(
  JSON.stringify(
    {
      checks: results.length,
      passed: results.filter((r) => r.passed).length,
      failures: results.filter((r) => !r.passed),
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
