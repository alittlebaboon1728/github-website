import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ready, catalog } from "../tests/fixtures/trials.mjs";

// Visual fixtures only; never generate cards/trials or contact a model provider.
const output = "docs/screenshots/glass-consistency";
await mkdir(output, { recursive: true });
const { repositories } = JSON.parse(
  await readFile(
    new URL("../src/repository-snapshot.json", import.meta.url),
    "utf8",
  ),
);
const samples = repositories.slice(0, 4);
const raw = (r) => ({
  id: Number(r.id),
  name: r.name,
  full_name: r.fullName,
  owner: { login: r.owner, avatar_url: r.avatar },
  html_url: r.url,
  description: r.description,
  stargazers_count: r.stars,
  forks_count: r.forks,
  language: r.language,
  topics: r.tags,
  license: { spdx_id: r.license },
  default_branch: r.defaultBranch,
  pushed_at: r.updated,
  created_at: r.createdAt,
  private: false,
  open_issues_count: r.openIssues,
});
const envelope = (data) => ({
  data,
  source: "cache",
  fetchedAt: "2026-11-01T05:00:00Z",
});
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
        ({ dark, samples }) => {
          if (window !== window.top) return;
          localStorage.setItem("gh-design-dark", JSON.stringify(dark));
          localStorage.setItem("observatory-saved-v1", JSON.stringify(samples));
        },
        { dark, samples },
      );
      const page = await context.newPage();
      const errors = [];
      let posts = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/observatory/**", (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        if (route.request().method() === "POST" && !path.includes("/cards/"))
          posts++;
        if (path.includes("/cards/"))
          return route.fulfill({
            json: envelope({
              id: "visual-ranking",
              state: "ready",
              pages: [
                {
                  number: 1,
                  state: "ready",
                  items: samples.map(raw),
                  cards: {},
                  errors: {},
                  total: samples.length,
                },
              ],
            }),
          });
        const data = path.endsWith("/status")
          ? { cardGeneration: false, aiConfigured: false }
          : path.endsWith("/project-media")
            ? { image: null }
            : path.endsWith("/trials")
              ? url.searchParams.has("repo")
                ? ready
                : catalog
              : path.endsWith("/trends")
                ? {
                    repositories: samples.map(raw),
                    query: "is:public",
                    scope: "视觉检查样例",
                    persistence: true,
                    growth: {
                      ready: false,
                      items: [],
                      coverage: "视觉检查样例",
                    },
                  }
                : path.endsWith("/activity") || path.endsWith("/pulse")
                  ? { events: [], scope: "视觉检查样例" }
                  : null;
        return route.fulfill(
          data
            ? { json: envelope(data) }
            : { status: 503, json: { error: "视觉检查不调用模型" } },
        );
      });
      await page.route("**/api/github/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        const repo =
          repositories.find((r) => path.endsWith(r.fullName)) || samples[0];
        const data = path.endsWith("/search")
          ? {
              items: samples.map(raw),
              total_count: 4,
              incomplete_results: false,
            }
          : path.endsWith("/readme")
            ? {
                content: "# 项目说明\n\n此处为界面检查使用的文档样例。",
                path: "README.md",
                html_url: repo.url + "#readme",
              }
            : raw(repo);
        return route.fulfill({ json: envelope(data) });
      });
      for (const [name, route, selector] of [
        ["discover", "/#/discover", ".project-card"],
        ["rankings", "/#/trends", ".ranking-tabs"],
        ["library", "/#/stories", '[aria-hidden="false"] .trial-feature'],
        ["generated", "/#/trial/sample/notebook", ".reader-copy"],
        ["whiteboard", "/#/project/excalidraw/excalidraw", ".reader-copy"],
        ["saved", "/#/saved", ".project-card"],
      ]) {
        errors.length = 0;
        await page.goto(`http://127.0.0.1:5173${route}`);
        await expect(page.locator(selector).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        const metric = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          headings: [...document.querySelectorAll("h2")].map(
            (el) => el.textContent,
          ),
        }));
        await page.screenshot({
          path: `${output}/${name}-${theme}-${width}.png`,
        });
        checks.push({
          name,
          theme,
          width,
          ...metric,
          errors: [...errors],
          posts,
          passed: !metric.overflow && !errors.length && posts === 0,
        });
        if (name === "generated") {
          await page.getByRole("button", { name: "打开交互体验" }).click();
          await expect(page.locator(".trial-sandbox")).toBeVisible();
          await page.locator(".trial-workspace").scrollIntoViewIfNeeded();
          await page.waitForTimeout(350);
          await page.screenshot({
            path: `${output}/walkthrough-${theme}-${width}.png`,
          });
        }
        if (name === "whiteboard") {
          const action = page.locator('[data-action="open-whiteboard"]');
          await expect(action).toHaveCount(1);
          await expect(
            page.locator('#hands-on [data-action="open-whiteboard"]'),
          ).toHaveCount(1);
          await action.scrollIntoViewIfNeeded();
          await page.waitForTimeout(350);
          await page.screenshot({
            path: `${output}/experience-${theme}-${width}.png`,
          });
        }
        if (name === "discover") {
          await page
            .locator(".project-card")
            .first()
            .getByRole("button", { name: /快速了解/ })
            .click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          const launch = dialog.getByRole("button", { name: /项目试用/ });
          await launch.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/quick-read-${theme}-${width}.png`,
          });
          checks.push({
            name: "quick-read",
            theme,
            width,
            errors: [...errors],
            posts,
            passed:
              (await dialog.evaluate(
                (el) => el.scrollWidth <= el.clientWidth + 2,
              )) &&
              !errors.length &&
              posts === 0,
          });
        }
      }
      await context.close();
    }
} finally {
  await browser.close();
}
await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2));
console.log(
  JSON.stringify(
    {
      checks: checks.length,
      passed: checks.filter((c) => c.passed).length,
      failures: checks.filter((c) => !c.passed),
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.passed)) process.exitCode = 1;
