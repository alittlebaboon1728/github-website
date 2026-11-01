import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const directory = "docs/screenshots/liquid-glass";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const check = async (name, theme, width) => {
  // Let the original compositor and backdrop layers settle after resize/theme changes.
  await page.waitForTimeout(350);
  const actual = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  if (actual > width)
    throw new Error(`${name} ${theme} ${width}: overflow ${actual}`);
  checks.push({ name, theme, width, actual });
  if ([390, 1440].includes(width))
    await page.screenshot({
      path: `${directory}/${name}-${theme}-${width}.png`,
    });
};
try {
  await page.goto("http://localhost:5173/#/discover");
  await page.locator(".project-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "切换深色主题", exact: true })
        .click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      await check("home", theme, width);
      await page
        .locator(".project-card")
        .first()
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(120);
      await check("cards", theme, width);
      const boxes = await page
        .locator(".project-card")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
          }),
        );
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          if (
            a.x < b.right - 1 &&
            b.x < a.right - 1 &&
            a.y < b.bottom - 1 &&
            b.y < a.bottom - 1
          )
            throw new Error(`overlap ${theme} ${width} ${i}/${j}`);
        }
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByRole("button", { name: "搜索设置", exact: true }).click();
    await check("menu", theme, 1440);
    await page.keyboard.press("Escape");
    await page
      .locator(".project-card")
      .first()
      .getByRole("button", { name: /快速了解/ })
      .click();
    await page.getByRole("dialog").waitFor();
    await check("quick-read", theme, 1440);
    await page.keyboard.press("Escape");
  }
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "切换浅色主题", exact: true })
        .click();
    for (const route of ["trends"]) {
      await page.goto(`http://localhost:5173/#/${route}`);
      await page.locator(".content-page").waitFor();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await check(route, theme, width);
      }
    }
  }
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  if (errors.length) throw new Error(errors.join("; "));
  console.log(JSON.stringify({ checks: checks.length, errors }));
} finally {
  await browser.close();
}
