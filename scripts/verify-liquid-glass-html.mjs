import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const directory = "docs/screenshots/liquid-glass-html";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [],
  checks = [],
  materials = [];
page.on("pageerror", (error) => errors.push(error.message));
const check = async (name, theme, width) => {
  // Allow layout and theme changes to paint before capturing.
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
  await page.addInitScript(() => {
    localStorage.setItem("observatory-view", JSON.stringify("list"));
    localStorage.setItem("gh-design-dark", "false");
  });
  await page.goto("http://localhost:5173/#/discover");
  await page.locator(".project-card").first().waitFor();
  await page.locator(".project-search[data-lg-refraction]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "切换深色主题", exact: true })
        .click();
    materials.push({
      theme,
      surfaces: await page
        .locator(
          ".project-search, .project-search-submit, .project-card, .primary-button, .gh-pulse, .save-btn",
        )
        .evaluateAll((elements) =>
          elements.slice(0, 16).map((element) => {
            const css = getComputedStyle(element);
            return {
              name: element.className,
              background: css.backgroundColor,
              color: css.color,
              blur: css.backdropFilter,
            };
          }),
        ),
    });
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
      const columns = await page
        .locator(".project-masonry")
        .evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
        );
      if (columns !== (width > 600 ? 2 : 1))
        throw new Error(`wrong column count ${theme} ${width}: ${columns}`);
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const box = await page.getByRole("dialog").boundingBox();
      if (
        Math.abs(box.x + box.width / 2 - width / 2) > 2 ||
        Math.abs(box.y + box.height / 2 - 500) > 2
      )
        throw new Error(`quick read is not centered: ${theme} ${width}`);
      if (await page.locator(".editorial-review, .related-articles").count())
        throw new Error("removed project sections still render");
      await check("quick-read", theme, width);
    }
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "切换浅色主题", exact: true })
        .click();
    for (const route of ["trends"]) {
      await page.goto(`http://localhost:5173/#/${route}`);
      await page.locator(".content-page").waitFor();
      if (
        (await page.evaluate(() => document.documentElement.dataset.theme)) !==
        theme
      )
        await page
          .getByRole("button", {
            name: theme === "dark" ? "切换深色主题" : "切换浅色主题",
            exact: true,
          })
          .click();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await check(route, theme, width);
      }
    }
  }
  await page.goto("http://localhost:5173/#/discover");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const search = page.locator(".project-search");
  await search.hover({ position: { x: 80, y: 22 } });
  await page.waitForTimeout(300);
  const lightStart = await search.evaluate((e) =>
    e.style.getPropertyValue("--glint-x"),
  );
  await search.hover({ position: { x: 330, y: 32 } });
  await page.waitForTimeout(300);
  const lightEnd = await search.evaluate((e) =>
    e.style.getPropertyValue("--glint-x"),
  );
  if (!lightStart || lightStart === lightEnd)
    throw new Error("Pointer light did not move");
  await page.screenshot({ path: `${directory}/search-reflection.png` });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const reduced = await search.evaluate((e) => ({
    light: e.style.getPropertyValue("--glint-x"),
    transform: getComputedStyle(e).transform,
  }));
  if (reduced.light || reduced.transform !== "none")
    throw new Error("Reduced motion did not reset optical motion");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-reduced-transparency", value: "reduce" },
    ],
  });
  const opaque = await search.evaluate((e) => ({
    blur: getComputedStyle(e).backdropFilter,
    background: getComputedStyle(e).backgroundColor,
  }));
  if (opaque.blur !== "none" || !opaque.background.startsWith("rgb("))
    throw new Error("Reduced transparency fallback failed");
  checks.push(
    { name: "pointer-reflection", lightStart, lightEnd },
    { name: "reduced-motion", ...reduced },
    { name: "reduced-transparency", ...opaque },
  );
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await page.locator(".project-search[data-lg-refraction]").waitFor();
  await session.detach();
  const stats = await page.evaluate(() => ({
    svgRoots: document.querySelectorAll("svg[data-liquid-glass-html]").length,
    filters: document.querySelectorAll("svg[data-liquid-glass-html] filter")
      .length,
    active: document.querySelectorAll("[data-lg-refraction]").length,
    filter: getComputedStyle(document.querySelector(".project-search"))
      .backdropFilter,
  }));
  if (stats.svgRoots !== 1 || !stats.filter.includes("url("))
    throw new Error("Original SVG pipeline missing");
  checks.push({ name: "original-svg-pipeline", ...stats });
  // Temporary test grid only. These screenshots verify real pixels, not just CSS declarations.
  await page.evaluate(() => {
    const search = document.querySelector(".project-search");
    search.style.setProperty("--lgh-blur", "0px");
    search.style.setProperty("--lgh-brightness", "1");
    const rect = search.getBoundingClientRect();
    const grid = document.createElement("div");
    grid.id = "refraction-verification-grid";
    grid.style.cssText = `position:absolute;left:${rect.x - 20}px;top:${rect.y + scrollY - 20}px;width:${rect.width + 40}px;height:${rect.height + 40}px;z-index:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 11px,#30435d 11px 12px),repeating-linear-gradient(90deg,#f2eee7 0 11px,#30435d 11px 12px)`;
    document.querySelector(".observatory-shell").append(grid);
  });
  await page.waitForTimeout(300);
  const clip = await search.boundingBox();
  await page.screenshot({ path: `${directory}/refraction-on.png`, clip });
  await search.evaluate((e) =>
    e.style.setProperty(
      "backdrop-filter",
      "blur(0px) saturate(150%) brightness(1)",
      "important",
    ),
  );
  await page.screenshot({ path: `${directory}/refraction-off.png`, clip });
  const pixels = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `
from PIL import Image, ImageChops, ImageStat
import json,sys
on=Image.open(sys.argv[1]).convert('RGB')
off=Image.open(sys.argv[2]).convert('RGB')
diff=ImageChops.difference(on,off)
w,h=on.size
edge=sum(ImageStat.Stat(diff.crop((80,0,w-80,12))).mean)/3
center=sum(ImageStat.Stat(diff.crop((110,h//2-6,w-110,h//2+6))).mean)/3
assert edge>2 and center<edge, (edge,center)
print(json.dumps({'edgePixelDifference':round(edge,3),'centerPixelDifference':round(center,3)}))
`,
        `${directory}/refraction-on.png`,
        `${directory}/refraction-off.png`,
      ],
      { encoding: "utf8" },
    ),
  );
  checks.push({ name: "rendered-edge-displacement", ...pixels });
  await page.evaluate(() =>
    document.getElementById("refraction-verification-grid")?.remove(),
  );
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ checks, materials, errors }, null, 2),
  );
  if (errors.length) throw new Error(errors.join("; "));
  console.log(JSON.stringify({ checks: checks.length, errors }));
} finally {
  await browser.close();
}
