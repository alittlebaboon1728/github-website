import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const directory = "docs/screenshots/pulse";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const checks = [];
try {
  await page.goto("http://localhost:5173/#/discover");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
      theme === "dark",
    );
    await page.reload();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const pulse = page.locator(".gh-pulse");
      await pulse.scrollIntoViewIfNeeded();
      await pulse.locator(".gh-pulse-event").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await pulse.screenshot({ path: `${directory}/${theme}-${width}.png` });
      const layout = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        width: innerWidth,
        rows: document.querySelectorAll(".gh-pulse-event").length,
        bars: document.querySelectorAll(".gh-pulse-bar").length / 2,
      }));
      if (layout.page > width) throw new Error(`overflow ${theme} ${width}`);
      checks.push({ theme, ...layout });
      if ([360, 390, 1440].includes(width)) {
        const chart = pulse.getByRole("group", { name: /公开活动柱图/ });
        await chart.hover();
        await chart
          .locator(".gh-pulse-bar-slot")
          .nth(layout.bars - 1)
          .hover();
        const tooltip = chart.getByRole("tooltip");
        await tooltip.waitFor();
        const card = await tooltip.boundingBox();
        if (card.x < 0 || card.x + card.width > width)
          throw new Error(`tooltip overflow ${theme} ${width}`);
        await page.screenshot({
          path: `${directory}/${theme}-${width}-tooltip.png`,
        });
        await page.mouse.move(0, 0);
      }
      if (width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${directory}/${theme}-page.png` });
      }
    }
  }
  const response = await page.request.get(
    "http://localhost:5173/api/observatory/pulse",
  );
  const data = await response.json();
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify(
      {
        checks,
        errors,
        api: {
          status: response.status(),
          provider: data.data?.provider,
          events: data.data?.events.length,
          bars: data.data?.bars.length,
          fetchedAt: data.fetchedAt,
        },
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors, api: response.status() }));
  if (errors.length) throw new Error(errors.join(";"));
} finally {
  await browser.close();
}
