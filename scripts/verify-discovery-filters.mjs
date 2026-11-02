// Actual saved catalog and API responses. An optional response delay verifies
// that switching controls can paint cached Chinese before the network returns.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.FILTER_BASE_URL || "http://127.0.0.1:4173";
const apiDelay = Number(process.env.FILTER_API_DELAY_MS || 1000);
const output = ".build/filter-speed";
await mkdir(output, { recursive: true });
const report = {
  base,
  apiDelay,
  at: new Date().toISOString(),
  runs: [],
  api: [],
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 1280, 390])
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
        dark,
      );
      const page = await context.newPage();
      const errors = [],
        posts = [],
        switches = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.method() === "POST")
          posts.push(new URL(request.url()).pathname);
      });
      await page.route("**/api/github/search?**", async (route) => {
        const url = new URL(route.request().url());
        if (
          !url.searchParams.get("q")?.includes("language:") &&
          url.searchParams.get("sort") === "stars"
        )
          return route.continue();
        try {
          const start = performance.now();
          const response = await route.fetch();
          const body = await response.json();
          report.api.push({
            q: url.searchParams.get("q"),
            sort: url.searchParams.get("sort"),
            ms: performance.now() - start,
            status: response.status(),
            preview: Boolean(body.data?.filter_preview),
            count: body.data?.items?.length,
          });
          await delay(apiDelay);
          await route.fulfill({ response, json: body });
        } catch (error) {
          if (!page.isClosed()) throw error;
        }
      });
      const catalogReady = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/observatory/catalog",
      );
      await page.goto(`${base}/#/discover`);
      await catalogReady;
      await expect(page.locator(".project-card.has-ai-summary")).toHaveCount(
        12,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".project-browser-controls").scrollIntoViewIfNeeded();
      let language = "";
      for (const [name, value] of [
        ...[
          "TypeScript",
          "JavaScript",
          "Python",
          "Go",
          "Rust",
          "Java",
          "C++",
        ].map((value) => ["按编程语言筛选", value]),
        ["项目排序", "updated"],
        ["项目排序", "best-match"],
      ]) {
        if (name === "按编程语言筛选") language = value;
        const frame = await page.evaluate(
          async ({ name, value }) => {
            const select = document.querySelector(
              `select[aria-label="${name}"]`,
            );
            const start = performance.now();
            select.value = value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            await new Promise(requestAnimationFrame);
            return {
              ms: performance.now() - start,
              count: document.querySelectorAll(".project-card").length,
              chinese: document.querySelectorAll(".project-card.has-ai-summary")
                .length,
              skeletons: document.querySelectorAll(".skeleton-grid").length,
              languages: [
                ...document.querySelectorAll(
                  ".project-card .trend-card-stats > span:first-child",
                ),
              ].map((node) => node.textContent.trim()),
            };
          },
          { name, value },
        );
        expect(frame.count).toBeGreaterThan(0);
        expect(frame.chinese).toBe(frame.count);
        expect(frame.languages.every((item) => item === language)).toBe(true);
        expect(frame.skeletons).toBe(0);
        switches.push({ name, value, ...frame });
      }
      await page.screenshot({
        path: `${output}/${dark ? "dark" : "light"}-${width}.png`,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(posts).toEqual([]);
      expect(errors).toEqual([]);
      report.runs.push({ width, dark, switches, posts, errors });
      await context.close();
    }
} finally {
  await browser.close();
}
const times = report.runs
  .flatMap((run) => run.switches.map((item) => item.ms))
  .sort((a, b) => a - b);
report.summary = {
  switches: times.length,
  min: times[0],
  median: times[Math.floor(times.length / 2)],
  p95: times[Math.ceil(times.length * 0.95) - 1],
  max: times.at(-1),
};
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
