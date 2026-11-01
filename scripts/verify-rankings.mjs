import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const directory = "docs/screenshots/rankings";
await mkdir(directory, { recursive: true });
const base = "http://localhost:5173/api/observatory";
const ranking = await (
  await fetch(`${base}/trends?kind=stars&language=&topic=&days=7`)
).json();
if (!ranking.data?.repositories?.length)
  throw new Error("Live ranking unavailable");
const names = ranking.data.repositories
  .slice(0, 10)
  .map((repo) => repo.full_name);
const response = await fetch(`${base}/cards/ranking`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ repositories: names }),
});
if (!response.ok)
  throw new Error(`Live card service returned ${response.status}`);
let job = (await response.json()).data;
for (let i = 0; i < 60 && job.state === "running"; i++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  job = (await (await fetch(`${base}/cards/jobs/${job.id}`)).json()).data;
}
const cards = job.pages[0].cards;
if (names.some((name) => !/[\u3400-\u9fff]/.test(cards[name]?.summary || "")))
  throw new Error("Some live summaries are not ready");
const live = {
  count: names.length,
  summaries: names.map((name) => ({
    name,
    model: cards[name].model,
    generatedAt: cards[name].generatedAt,
    sourceUrl: cards[name].sourceUrl,
  })),
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 1100 },
});
const checks = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const check = async (name, theme, width, screenshot = false) => {
  await page.waitForTimeout(450);
  const result = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    overflow: document.documentElement.scrollWidth > innerWidth,
    headerSearch: !!document.querySelector(".site-header .header-search"),
    rows: [...document.querySelectorAll(".ranking-row")].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  }));
  if (
    result.theme !== theme ||
    result.overflow ||
    result.headerSearch ||
    result.rows.some(
      (r, i) =>
        r.left < 0 ||
        r.right > width ||
        (i && r.top < result.rows[i - 1].bottom),
    )
  )
    throw new Error(JSON.stringify({ name, theme, width, ...result }));
  checks.push({
    name,
    theme,
    width,
    overflow: false,
    rows: result.rows.length,
  });
  if (screenshot)
    await page.screenshot({
      path: `${directory}/${name}-${theme}-${width}.png`,
    });
};
try {
  await page.goto("http://localhost:5173/#/trends");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        localStorage.setItem("gh-design-dark", String(theme === "dark")),
      theme,
    );
    for (const width of [360, 390, 600, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto("http://localhost:5173/#/trends");
      await page.reload();
      await page.locator(".ranking-row.has-ai-summary").nth(9).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await check("ranking", theme, width, [360, 390, 1440].includes(width));
      if (width === 390) {
        await page.getByText("筛选榜单范围", { exact: true }).click();
        await check("filters", theme, width, true);
      }
    }
    await page.locator(".ranking-project-title").first().click();
    await page.getByRole("dialog").waitFor();
    await check("summary-reading", theme, 1440, true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "热门趋势", exact: true }).click();
    await page.locator(".ranking-empty, .ranking-row").first().waitFor();
    await check("live-trend", theme, 1440, true);
  }
  // Explicit visual fixture for growth states: these are not claimed as collected historical data.
  await page.route("**/api/observatory/trends?*", (route) =>
    route.fulfill({
      json: {
        ...ranking,
        data: {
          ...ranking.data,
          growth: {
            ready: true,
            days: 7,
            from: "2026-10-25T08:00:00Z",
            to: "2026-11-01T08:00:00Z",
            coverage: "Visual fixture",
            items: ranking.data.repositories.slice(0, 3).map((repo, i) => ({
              repo,
              delta: [138, 0, -12][i],
              points: [
                {
                  at: "2026-10-25T08:00:00Z",
                  stars: repo.stargazers_count - [138, 0, -12][i],
                },
                { at: "2026-11-01T08:00:00Z", stars: repo.stargazers_count },
              ],
            })),
          },
        },
      },
    }),
  );
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        localStorage.setItem("gh-design-dark", String(theme === "dark")),
      theme,
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto("http://localhost:5173/#/trends?view=growth");
      await page.reload();
      await page.locator(".star-sparkline").first().waitFor();
      await check("growth-fixture", theme, width, true);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    `${directory}/checks.json`,
    JSON.stringify(
      { live, checks, errors, growthScreenshotsUseFixtures: true },
      null,
      2,
    ),
  );
  console.log(
    `${checks.length} visual checks passed. ${live.count} real AI summaries verified; no page errors.`,
  );
} finally {
  await browser.close();
}
