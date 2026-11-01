import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const directory = "docs/screenshots/navigation-droplet";
await mkdir(directory, { recursive: true });
const { repositories } = JSON.parse(
  await readFile("src/repository-snapshot.json", "utf8"),
);
const repos = repositories.slice(1, 3).map((r) => ({
  id: Number(r.id),
  owner: { login: r.owner, avatar_url: r.avatar },
  name: r.name,
  full_name: r.fullName,
  description: r.description,
  language: r.language,
  stargazers_count: r.stars,
  forks_count: r.forks,
  pushed_at: r.updated,
  topics: r.tags,
  html_url: r.url,
  homepage: r.homepage,
  license: { spdx_id: r.license },
  default_branch: r.defaultBranch,
  created_at: r.createdAt,
  open_issues_count: r.openIssues,
  archived: false,
  private: false,
}));
const envelope = (data) => ({
  data,
  source: "live",
  fetchedAt: new Date().toISOString(),
});
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [],
  frames = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/github/**", (route) =>
  route.fulfill({
    json: envelope({ items: repos, total_count: 2, incomplete_results: false }),
  }),
);
await page.route("**/api/observatory/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/pulse"))
    return route.fulfill({
      json: envelope({ events: [], scope: "界面验证样例" }),
    });
  if (path.endsWith("/trends"))
    return route.fulfill({
      json: envelope({
        repositories: [],
        query: "is:public",
        growth: { ready: false, items: [] },
      }),
    });
  return route.fulfill({ status: 503, json: { error: "界面验证未启用 AI" } });
});
const openMenu = async (width) => {
  if (
    width <= 820 &&
    (await page
      .getByRole("button", { name: "打开导航", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
};
const geometry = () =>
  page
    .locator(".site-header-inner, .site-navigation > a")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
try {
  await page.addInitScript(() =>
    localStorage.setItem("gh-design-dark", "false"),
  );
  await page.goto("http://localhost:5173/#/discover");
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".navigation-droplet[data-lg-refraction]").waitFor();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "切换深色主题", exact: true })
        .click();
    for (const width of [1440, 1024, 821, 820, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await openMenu(width);
      await page.locator('.site-navigation a[href="#/discover"]').click();
      await openMenu(width);
      await page.waitForTimeout(650);
      const before = await geometry();
      if ([1440, 390, 360].includes(width))
        await page.screenshot({
          path: `${directory}/discover-${theme}-${width}.png`,
        });
      await page.locator('.site-navigation a[href="#/saved"]').click();
      await openMenu(width);
      await page.waitForTimeout(650);
      const after = await geometry();
      const result = await page.evaluate(() => {
        const selected = document
          .querySelector(".site-navigation .selected")
          .getBoundingClientRect();
        const droplet = document
          .querySelector(".navigation-droplet")
          .getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          alignmentError:
            Math.abs(selected.x - droplet.x) +
            Math.abs(selected.y - droplet.y) +
            Math.abs(selected.width - droplet.width),
        };
      });
      if (
        JSON.stringify(before) !== JSON.stringify(after) ||
        result.overflow ||
        result.alignmentError > 1.5
      )
        throw new Error(
          JSON.stringify({ theme, width, before, after, ...result }),
        );
      checks.push({ theme, width, stable: true, ...result });
      if ([1440, 390].includes(width))
        await page.screenshot({
          path: `${directory}/saved-${theme}-${width}.png`,
        });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.site-navigation a[href="#/discover"]').click();
    await page.waitForTimeout(650);
    await page.locator('.site-navigation a[href="#/saved"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector(".navigation-droplet").getAnimations().length >
        0,
    );
    for (const progress of [0, 0.42, 0.76, 1]) {
      const matrix = await page
        .locator(".navigation-droplet")
        .evaluate((el, progress) => {
          const animation = el.getAnimations()[0];
          animation.pause();
          animation.currentTime =
            Number(animation.effect.getTiming().duration) * progress;
          return getComputedStyle(el).transform;
        }, progress);
      frames.push({ theme, progress, matrix });
      await page.screenshot({
        path: `${directory}/motion-${theme}-${progress}.png`,
        clip: { x: 100, y: 0, width: 1230, height: 105 },
      });
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    `${directory}/checks.json`,
    JSON.stringify({ checks, frames, errors, fixtures: true }, null, 2),
  );
  console.log(
    `${checks.length} responsive/theme checks passed; 8 animation frames captured; no page errors.`,
  );
} finally {
  await browser.close();
}
