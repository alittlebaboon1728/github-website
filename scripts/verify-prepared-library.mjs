// Validate the deployed service with Chinese generation enabled and no mocked API responses.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import categories from "../shared/discovery-categories.json" with { type: "json" };

const base = process.env.LIBRARY_BASE_URL || "http://127.0.0.1:4173";
const output = ".build/prepared-library";
await mkdir(output, { recursive: true });
const status = await fetch(`${base}/api/observatory/status`).then((r) =>
  r.json(),
);
assert.equal(status.data.cardGeneration, true);
assert.equal(status.data.discoveryBackground, true);
const library = await fetch(`${base}/api/observatory/library/status`).then(
  (r) => r.json(),
);
assert.ok(
  library.data.scopes
    .filter((scope) => scope.defaultScope)
    .every((scope) =>
      scope.prepared.slice(0, 3).every((page) => page.complete),
    ),
);
const report = {
  base,
  at: new Date().toISOString(),
  library: library.data,
  api: [],
  runs: [],
};
for (const category of categories) {
  const start = performance.now();
  const response = await fetch(
    `${base}/api/github/search?${new URLSearchParams({ q: category.query, sort: "stars", page: "1" })}`,
  );
  const result = await response.json();
  assert.equal(result.data.pending_count, 0);
  assert.equal(result.data.items.length, 12);
  assert.ok(
    result.data.items.every((repo) =>
      /[\u3400-\u9fff]/.test(result.data.cards[repo.full_name]?.summary),
    ),
  );
  report.api.push({
    category: category.id,
    ms: performance.now() - start,
    Chinese: result.data.items.length,
  });
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 390])
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1100 },
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (value) =>
          localStorage.setItem("gh-design-dark", JSON.stringify(value)),
        dark,
      );
      const page = await context.newPage();
      const errors = [],
        posts = [],
        searches = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.method() === "POST") posts.push(request.url());
        if (new URL(request.url()).pathname === "/api/github/search")
          searches.push(request.url());
      });
      const catalogResponse = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/observatory/catalog",
      );
      const rankingResponse = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/observatory/trends",
      );
      const start = performance.now();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator(".project-card.has-ai-summary").first().waitFor();
      const firstChineseMs = performance.now() - start;
      await (await catalogResponse).finished();
      await (await rankingResponse).finished();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      if (!(await page.locator(".category-filters").isVisible()))
        await page.getByRole("button", { name: "用途、语言与排序" }).click();
      const run = {
        width,
        dark,
        firstChineseMs,
        switches: [],
        searchesBeforeSwitches: searches.length,
        errors,
        posts,
      };
      for (const category of categories) {
        const frame = await page.evaluate(
          async (label) => {
            const button = [
              ...document.querySelectorAll(".category-filters button"),
            ].find((node) => node.textContent === label);
            const start = performance.now();
            button.click();
            await new Promise(requestAnimationFrame);
            return {
              ms: performance.now() - start,
              Chinese: document.querySelectorAll(".project-card.has-ai-summary")
                .length,
              skeletons: document.querySelectorAll(".skeleton-grid").length,
              preparing: document.querySelectorAll(".card-generation-progress")
                .length,
              overflow:
                document.documentElement.scrollWidth > window.innerWidth,
            };
          },
          category.id === "all" ? "全部" : category.name,
        );
        assert.equal(frame.Chinese, 12, `${category.id} Chinese`);
        assert.equal(frame.skeletons, 0);
        assert.equal(frame.preparing, 0);
        assert.equal(frame.overflow, false);
        run.switches.push({ category: category.id, ...frame });
        if (["web", "data"].includes(category.id)) {
          await page.locator("#project-browser").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/${category.id}-${width}-${dark ? "dark" : "light"}.png`,
          });
        }
      }
      for (const total of [24, 36]) {
        await page
          .getByRole("button", { name: "加载更多项目", exact: true })
          .click();
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll(".project-card.has-ai-summary").length ===
            count,
          total,
        );
      }
      assert.equal(
        searches.length,
        run.searchesBeforeSwitches,
        "cached categories and pages should not repeat search requests",
      );
      if (
        !(await page.locator('.site-navigation a[href="#/trends"]').isVisible())
      )
        await page
          .getByRole("button", { name: "打开导航", exact: true })
          .click();
      await page.locator('.site-navigation a[href="#/trends"]').click();
      await page.locator(".ranking-row.has-ai-summary").first().waitFor();
      assert.equal(
        await page.locator(".ranking-row.has-ai-summary").count(),
        10,
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(posts, []);
      report.runs.push(run);
      await context.close();
    }
  for (const id of ["web", "data"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/github/search",
    );
    await page.goto(`${base}/#/discover?category=${id}`, {
      waitUntil: "domcontentloaded",
    });
    const value = await (await response).json();
    assert.equal(value.data.items.length, 12);
    assert.equal(Object.keys(value.data.cards).length, 12);
    await page.locator(".project-card.has-ai-summary").first().waitFor();
    assert.equal(
      await page.locator(".project-card.has-ai-summary").count(),
      12,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
const frames = report.runs
  .flatMap((run) => run.switches.map((frame) => frame.ms))
  .sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      base,
      defaultScopesReady: library.data.scopes.filter(
        (scope) => scope.defaultScope,
      ).length,
      api: report.api,
      switches: frames.length,
      minMs: frames[0],
      medianMs: frames[Math.floor(frames.length / 2)],
      maxMs: frames.at(-1),
      posts: report.runs.flatMap((run) => run.posts),
      errors: report.runs.flatMap((run) => run.errors),
      output,
    },
    null,
    2,
  ),
);
