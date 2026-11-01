import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const directory = "docs/screenshots/search";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
try {
  await page.goto("http://localhost:5173/#/discover");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
      theme === "dark",
    );
    await page.reload();
    for (const width of [360, 390, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.activeElement?.blur());
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator(".gh-pulse-event").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const bar = document.querySelector(".gh-pulse-bar");
        return bar && new DOMMatrix(getComputedStyle(bar).transform).d > 0;
      });
      const layout = await page.evaluate(() => {
        const copy = document
          .querySelector(".discovery-hero-copy")
          .getBoundingClientRect();
        const pulse = document
          .querySelector(".discovery-hero .gh-pulse")
          .getBoundingClientRect();
        const form = document
          .querySelector(".project-search")
          .getBoundingClientRect();
        return {
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          copy: { x: copy.x, right: copy.right, bottom: copy.bottom },
          pulse: { x: pulse.x, top: pulse.top },
          search: {
            height: form.height,
            buttons: document.querySelectorAll(".project-search button").length,
            glass: getComputedStyle(document.querySelector(".project-search"))
              .backdropFilter,
          },
        };
      });
      if (layout.scroll > width) throw new Error(`overflow ${theme} ${width}`);
      if (width > 820 && layout.copy.right > layout.pulse.x)
        throw new Error(`desktop columns ${width}`);
      if (width <= 820 && layout.copy.bottom > layout.pulse.top)
        throw new Error(`mobile ordering ${width}`);
      if (layout.search.buttons !== 2)
        throw new Error("unexpected search actions");
      await page.screenshot({ path: `${directory}/${theme}-${width}.png` });
      await page.getByRole("button", { name: "搜索设置", exact: true }).click();
      const menu = await page
        .getByRole("menu", { name: "搜索模式", exact: true })
        .boundingBox();
      if (menu.x < 0 || menu.x + menu.width > width)
        throw new Error(`menu overflow ${width}`);
      const menuOnTop = await page
        .getByRole("menu", { name: "搜索模式", exact: true })
        .evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          );
        });
      if (!menuOnTop) throw new Error(`menu obscured ${theme} ${width}`);
      if ([360, 1440].includes(width))
        await page.screenshot({
          path: `${directory}/${theme}-${width}-settings.png`,
        });
      await page.keyboard.press("Escape");
      checks.push({ theme, ...layout, menu });
    }
  }
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, errors }));
  if (errors.length) throw new Error(errors.join(";"));
} finally {
  await browser.close();
}
