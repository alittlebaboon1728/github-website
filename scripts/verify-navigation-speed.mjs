// Read-only production check. Optional API_DELAY_MS simulates a slower connection;
// model POSTs are blocked in this browser context.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.NAVIGATION_BASE_URL || "http://127.0.0.1:4173";
const apiDelay = Number(process.env.API_DELAY_MS || 0);
const output = ".build/navigation-speed";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { base, apiDelay, at: new Date().toISOString(), runs: [] };
try {
  for (const width of [1440, 390]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const reveal = async (selector) => {
        if (
          selector.startsWith(".site-navigation") &&
          !(await page.locator(selector).isVisible())
        )
          await page
            .getByRole("button", { name: "打开导航", exact: true })
            .click();
        await page.locator(selector).waitFor({ state: "visible" });
      };
      const navigate = async (selector) => {
        await reveal(selector);
        await page.locator(selector).click();
      };
      const errors = [];
      const requests = [];
      const blockedPosts = [];
      page.on("pageerror", (error) =>
        errors.push(error.stack || error.message),
      );
      page.on("request", (request) => {
        if (
          request.method() === "GET" &&
          /\/api\/(github|observatory)\//.test(request.url())
        )
          requests.push(request.url());
      });
      await page.addInitScript(
        (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
        dark,
      );
      await page.route("**/api/observatory/**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET") {
          blockedPosts.push(url.pathname);
          return route.fulfill({
            status: 503,
            json: { error: "只读测速中不调用模型。" },
          });
        }
        if (url.pathname.endsWith("/status")) {
          const response = await route.fetch();
          const value = await response.json();
          value.data.cardGeneration = false;
          return route.fulfill({ json: value });
        }
        if (apiDelay && /\/(trends|trials)$/.test(url.pathname)) {
          const response = await route.fetch({ timeout: 60_000 });
          await delay(apiDelay);
          return route.fulfill({ response });
        }
        return route.continue();
      });
      if (apiDelay)
        await page.route("**/api/github/search?*", async (route) => {
          const response = await route.fetch({ timeout: 60_000 });
          await delay(apiDelay);
          return route.fulfill({ response });
        });
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator(".project-card").first().waitFor({ timeout: 60_000 });
      const categories = page.getByRole("group", { name: "按用途浏览" });
      if (!(await categories.isVisible()))
        await page.getByRole("button", { name: "用途、语言与排序" }).click();
      for (const name of ["AI 与智能", "设计与创意", "全部"]) {
        await categories.getByRole("button", { name, exact: true }).click();
        await page.waitForFunction(
          () =>
            document
              .querySelector("#project-browser")
              ?.getAttribute("aria-busy") === "false",
          null,
          { timeout: 60_000 },
        );
        if (await page.locator("#project-browser .api-error").count())
          throw new Error(`Initial ${name} fetch failed`);
      }
      await navigate('.site-navigation a[href="#/trends"]');
      await page.locator(".ranking-row").first().waitFor({ timeout: 60_000 });
      await navigate('.site-navigation a[href="#/stories"]');
      await page
        .locator(".trial-library-card")
        .first()
        .waitFor({ timeout: 60_000 });
      const run = { width, dark, frames: [], errors, blockedPosts };
      const targets = [
        ['.site-navigation a[href="#/discover"]', ".project-card"],
        [".category-filters button:nth-of-type(2)", ".project-card"],
        [".category-filters button:nth-of-type(4)", ".project-card"],
        [".category-filters button:nth-of-type(1)", ".project-card"],
        ['.site-navigation a[href="#/trends"]', ".ranking-row"],
        ['.site-navigation a[href="#/stories"]', ".trial-library-card"],
        ['.site-navigation a[href="#/saved"]', ".discovery-empty"],
      ];
      for (const [selector, content] of targets) {
        await reveal(selector);
        const before = requests.length;
        const frame = await page.evaluate(
          async ({ selector, content }) => {
            const element = document.querySelector(selector);
            const start = performance.now();
            const navigation =
              element instanceof HTMLAnchorElement &&
              element.hash !== location.hash
                ? new Promise((resolve) =>
                    window.addEventListener("hashchange", resolve, {
                      once: true,
                    }),
                  )
                : Promise.resolve();
            element.click();
            await navigation;
            await new Promise(requestAnimationFrame);
            return {
              selector,
              ms: Math.round((performance.now() - start) * 10) / 10,
              items: document.querySelectorAll(content).length,
              loaders: document.querySelectorAll(".page-loader, .skeleton-grid")
                .length,
              blocked: document.querySelectorAll(".project-grid[inert]").length,
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          },
          { selector, content },
        );
        frame.newGets = requests.length - before;
        if (!frame.items || frame.loaders || frame.blocked || frame.overflow)
          throw new Error(`Unexpected switch: ${JSON.stringify(frame)}`);
        run.frames.push(frame);
      }
      await navigate('.site-navigation a[href="#/discover"]');
      await page.locator(".project-card").first().waitFor();
      await page.locator("#project-browser").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/${width}-${dark ? "dark" : "light"}.png`,
        fullPage: true,
      });
      report.runs.push(run);
      if (errors.length) throw new Error(errors.join("\n"));
      console.log(JSON.stringify(run));
      await context.close();
    }
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
