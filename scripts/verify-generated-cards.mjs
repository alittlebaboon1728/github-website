import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const directory = "docs/screenshots/trend-cards";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("http://localhost:5173/#/discover");
  await page.locator(".has-ai-summary").first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "切换深色主题" }).click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .locator(".project-card")
        .filter({ has: page.locator(".trend-summary-source") })
        .first()
        .evaluate((el) =>
          el.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        generated: document.querySelectorAll(".project-card.has-ai-summary")
          .length,
        loading: document.querySelector(".card-generation-progress")
          ?.textContent,
      }));
      if (layout.scrollWidth > width)
        throw new Error(`overflow ${theme} ${width}`);
      await page.screenshot({ path: `${directory}/${theme}-${width}.png` });
      checks.push({ theme, ...layout });
    }
  }
  await page.getByRole("button", { name: "切换浅色主题" }).click();
  const cards = page
    .locator(".project-card")
    .filter({ has: page.locator(".trend-summary-source") });
  for (const index of [0, 1, 2])
    if (await cards.nth(index).count())
      await cards
        .nth(index)
        .screenshot({ path: `${directory}/card-${index}.png` });
  await cards
    .first()
    .getByRole("button", { name: /快速了解/ })
    .click();
  await page
    .getByRole("dialog")
    .screenshot({ path: `${directory}/quick-read.png` });
  await page.keyboard.press("Escape");
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, errors }));
  if (errors.length) throw new Error(errors.join("; "));
} finally {
  await browser.close();
}
