import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:5173";
const output = "docs/screenshots/trial-showcase";
await mkdir(output, { recursive: true });
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
      await context.addInitScript(
        (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
        dark,
      );
      const page = await context.newPage();
      const errors = [],
        posts = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.method() === "POST") posts.push(request.url());
      });
      // Read the real saved catalog; keep unrelated homepage services deterministic.
      await page.route("**/api/observatory/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/trials")) return route.continue();
        const data = path.endsWith("/status")
          ? { cardGeneration: false }
          : path.endsWith("/trends")
            ? { repositories: [], growth: { ready: false, items: [] } }
            : path.endsWith("/project-media")
              ? { image: null }
              : { events: [] };
        return route.fulfill({ json: { data } });
      });
      await page.route("**/api/github/**", (route) =>
        route.fulfill({
          json: {
            data: { items: [], total_count: 0, incomplete_results: false },
          },
        }),
      );
      for (const [name, route] of [
        ["library", "stories"],
        ["home", "discover"],
      ]) {
        await page.goto(`${base}/#/${route}`);
        const carousel = page.getByRole("region", { name: "精选项目试用" });
        await expect(
          carousel.getByRole("button", { name: "查看 marked 试用横幅" }),
        ).toBeVisible();
        await carousel.evaluate((element) =>
          window.scrollTo({
            top: element.getBoundingClientRect().top + scrollY - 105,
          }),
        );
        await page.evaluate(() => document.fonts.ready);
        for (const project of ["Excalidraw", "marked", "jq"]) {
          await carousel
            .getByRole("button", { name: `查看 ${project} 试用横幅` })
            .click();
          await expect(carousel.locator('[aria-hidden="false"] h2')).toHaveText(
            project,
          );
          await carousel.evaluate((element) =>
            window.scrollTo({
              top: element.getBoundingClientRect().top + scrollY - 105,
            }),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: `${output}/${name}-${project}-${theme}-${width}.png`,
          });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (name === "library") {
          await expect(
            page.locator(".trial-library-card .trial-illustration"),
          ).toHaveCount(3);
          await page
            .locator(".trial-shelf")
            .evaluate((element) =>
              window.scrollTo({
                top: element.getBoundingClientRect().top + scrollY - 105,
              }),
            );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: `${output}/cards-${theme}-${width}.png`,
          });
          for (const card of await page.locator(".trial-library-card").all()) {
            await card.scrollIntoViewIfNeeded();
            await card.screenshot({
              path: `${output}/card-${await card.locator("h3").innerText()}-${theme}-${width}.png`,
            });
          }
        }
        expect(errors).toEqual([]);
        expect(posts).toEqual([]);
        checks.push({
          page: name,
          theme,
          width,
          projects: ["Excalidraw", "marked", "jq"],
          errors: [...errors],
          posts: [...posts],
          passed: true,
        });
      }
      await context.close();
    }
} finally {
  await browser.close();
}
await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2));
console.log(JSON.stringify({ checks: checks.length, passed: checks.length }));
