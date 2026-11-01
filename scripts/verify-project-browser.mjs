import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const directory = "docs/screenshots/projects";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
const checks = [];
const api = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", async (response) => {
  if (!response.url().includes("/api/github/search?")) return;
  const body = await response.json();
  api.push({
    query: new URL(response.url()).searchParams.get("q"),
    status: response.status(),
    source: body.source,
    returned: body.data?.items.length,
    total: body.data?.total_count,
  });
});
try {
  await page.goto("http://localhost:5173/#/discover");
  await page.locator(".project-card").first().waitFor({ timeout: 25000 });
  await page.waitForFunction(
    () =>
      document.querySelector("#project-browser")?.getAttribute("aria-busy") ===
      "false",
  );
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "切换深色主题" }).click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .locator("#project-browser")
        .evaluate((el) =>
          el.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      const layout = await page
        .locator(".project-card")
        .first()
        .evaluate((card) => {
          const visual = card
            .querySelector(".exhibit-visual")
            .getBoundingClientRect();
          const text = card
            .querySelector(".exhibit-information")
            .getBoundingClientRect();
          return {
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            visualRight: visual.right,
            visualBottom: visual.bottom,
            textX: text.x,
            textY: text.y,
            cards: document.querySelectorAll(".project-card").length,
          };
        });
      if (layout.scrollWidth > width)
        throw new Error(`overflow: ${theme} ${width}`);
      if (width > 650 && layout.visualRight > layout.textX + 1)
        throw new Error("columns overlap");
      if (width <= 650 && layout.visualBottom > layout.textY + 1)
        throw new Error("stack overlaps");
      await page.screenshot({ path: `${directory}/${theme}-${width}.png` });
      checks.push({ theme, ...layout });
    }
  }
  await page.getByRole("button", { name: "切换浅色主题" }).click();
  const unknown = page
    .locator(".project-card")
    .filter({ has: page.locator(".card-readme") })
    .first();
  if (await unknown.count()) {
    await unknown.scrollIntoViewIfNeeded();
    await unknown.locator("summary").click();
    await unknown.locator(".card-readme > div").waitFor();
    await unknown
      .locator(".card-readme-loading")
      .waitFor({ state: "hidden", timeout: 25000 });
    await unknown.screenshot({ path: `${directory}/author-readme.png` });
  }
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .locator("#project-browser")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("list overflow");
    await page.screenshot({ path: `${directory}/list-${width}.png` });
  }
  await page.getByRole("button", { name: "卡片视图", exact: true }).click();
  const url = page.url();
  for (const name of [
    "AI 与智能",
    "开发者工具",
    "设计与创意",
    "网站与应用",
    "数据与后端",
    "全部",
  ]) {
    const response = page.waitForResponse((r) =>
      r.url().includes("/api/github/search?"),
    );
    await page
      .getByRole("group", { name: "按用途浏览" })
      .getByRole("button", { name, exact: true })
      .click();
    await response;
    await page.waitForFunction(
      () =>
        document
          .querySelector("#project-browser")
          ?.getAttribute("aria-busy") === "false",
    );
    if (
      page.url() !== url ||
      (await page.locator(".discovery-hero").count()) !== 1
    )
      throw new Error("category navigation left page");
    await page.screenshot({ path: `${directory}/category-${name}.png` });
  }
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ checks, api, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, api, errors }));
  if (errors.length) throw new Error(errors.join("; "));
} finally {
  await browser.close();
}
