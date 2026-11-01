import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL(
  "../docs/screenshots/excalidraw-reader/",
  import.meta.url,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const dark of [false, true]) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      const theme = dark ? "dark" : "light";
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
        dark,
      );
      const page = await context.newPage();
      const errors = [];
      let modelPosts = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/observatory/"))
          modelPosts++;
      });
      await page.goto("http://127.0.0.1:5173/#/project/excalidraw/excalidraw");
      await expect(page.locator(".reader-copy")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: fileURLToPath(new URL(`${theme}-${width}.png`, output)),
        fullPage: true,
      });
      const metric = await page.evaluate(() => ({
        width: innerWidth,
        contentWidth: document.documentElement.scrollWidth,
        fontSize: getComputedStyle(
          document.querySelector(".reader-copy section p"),
        ).fontSize,
        players: document.querySelectorAll(".story-player").length,
      }));
      results.push({
        theme,
        ...metric,
        modelPosts,
        errors: [...errors],
        passed:
          metric.contentWidth <= width &&
          metric.fontSize === "16px" &&
          metric.players === 0 &&
          modelPosts === 0 &&
          errors.length === 0,
      });
      if ([390, 1440].includes(width)) {
        await page
          .getByRole("button", { name: "打开交互白板", exact: true })
          .click();
        await expect(page.locator(".excalidraw")).toBeVisible({
          timeout: 45000,
        });
        await page
          .locator(".real-editor")
          .evaluate((element) => element.scrollIntoView({ block: "start" }));
        await page.evaluate(() => scrollBy(0, -90));
        await page.screenshot({
          path: fileURLToPath(new URL(`editor-${theme}-${width}.png`, output)),
        });
        const editor = await page.evaluate(() => ({
          width: innerWidth,
          contentWidth: document.documentElement.scrollWidth,
        }));
        results.push({
          name: "editor",
          theme,
          ...editor,
          errors: [...errors],
          passed: editor.contentWidth <= width && errors.length === 0,
        });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL("checks.json", output),
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify(
    {
      checks: results.length,
      passed: results.filter((x) => x.passed).length,
      failures: results.filter((x) => !x.passed),
    },
    null,
    2,
  ),
);
if (results.some((x) => !x.passed)) process.exitCode = 1;
