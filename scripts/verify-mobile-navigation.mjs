import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.MOBILE_UI_BASE_URL || "http://127.0.0.1:4173";
const output = ".build/mobile-navigation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { base, at: new Date().toISOString(), runs: [] };
const bounds = (element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};
const finish = (locator) =>
  locator.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.finish()),
  );
const middle = (locator) =>
  locator.evaluate((element) => {
    const animations = element.getAnimations();
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().duration) / 2;
    }
    return {
      animations: animations.length,
      opacity: Number(getComputedStyle(element).opacity),
      transform: getComputedStyle(element).transform,
    };
  });

try {
  for (const width of [360, 390, 600, 820, 821, 1440]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width <= 820,
      });
      await context.addInitScript(
        (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
        dark,
      );
      const page = await context.newPage();
      const errors = [],
        posts = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 503, json: { error: "只读界面验收" } });
      });
      await page.goto(`${base}/#/discover`);
      await page.evaluate(() => document.fonts.ready);
      const name = `${dark ? "dark" : "light"}-${width}`;
      const nav = page.locator("#project-navigation");
      const header = page.locator(".site-header-inner");
      const menu = page.locator(".nav-menu");
      const headerBefore = await header.evaluate(bounds);
      const run = { width, dark, switches: [], errors, posts };
      if (width <= 820) {
        await expect(nav).toHaveAttribute("inert");
        run.buttons = await page
          .locator(".site-tools .header-control")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect(),
                icon = element.querySelector("svg").getBoundingClientRect();
              return {
                width: box.width,
                height: box.height,
                centerError:
                  Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2) +
                  Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2),
              };
            }),
          );
        for (const button of run.buttons) {
          expect(button.width).toBe(44);
          expect(button.height).toBe(44);
          expect(button.centerError).toBeLessThan(1);
        }
        if (width === 390)
          await page.screenshot({ path: `${output}/header-${name}.png` });
        await menu.tap();
        await expect
          .poll(() => nav.evaluate((element) => element.getAnimations().length))
          .toBeGreaterThan(0);
        run.opening = await middle(nav);
        expect(run.opening.opacity).toBeGreaterThan(0);
        expect(run.opening.opacity).toBeLessThan(1);
        if (width === 390)
          await page.screenshot({ path: `${output}/opening-${name}.png` });
        await finish(nav);
      }
      for (const section of ["saved", "trends", "stories", "discover"]) {
        const link = nav.locator(`a[href="#/${section}"]`);
        if (width <= 820) await link.tap();
        else await link.click();
        await expect(link).toHaveAttribute("aria-current", "page");
        if (width <= 820)
          await expect(menu).toHaveAttribute("aria-expanded", "true");
        expect(await header.evaluate(bounds)).toEqual(headerBefore);
        const droplet = nav.locator(".navigation-droplet");
        await expect
          .poll(() =>
            droplet.evaluate((element) => element.getAnimations().length),
          )
          .toBeGreaterThan(0);
        run.switches.push({ section, moving: await middle(droplet) });
        if (section === "saved" && width === 390)
          await page.screenshot({ path: `${output}/switching-${name}.png` });
        await finish(droplet);
        const alignment = await nav.evaluate((element) => {
          const selected = element
              .querySelector(".selected")
              .getBoundingClientRect(),
            glass = element
              .querySelector(".navigation-droplet")
              .getBoundingClientRect();
          return (
            Math.abs(selected.x - glass.x) +
            Math.abs(selected.y - glass.y) +
            Math.abs(selected.width - glass.width)
          );
        });
        // Fractional grid columns round in offsetWidth/offsetLeft.
        expect(alignment).toBeLessThan(1.5);
      }
      if (width <= 820) {
        // A route may restore its scroll position; only user gestures dismiss.
        await page.evaluate(() => {
          window.scrollTo(0, 100);
          window.dispatchEvent(new Event("scroll"));
        });
        await expect(menu).toHaveAttribute("aria-expanded", "true");
        await page.touchscreen.tap(5, 880);
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        run.closing = await middle(nav);
        expect(run.closing.opacity).toBeGreaterThan(0);
        expect(run.closing.opacity).toBeLessThan(1);
        if (width === 390)
          await page.screenshot({ path: `${output}/closing-${name}.png` });
        await menu.tap();
        await expect(menu).toHaveAttribute("aria-expanded", "true");
        await finish(nav);
        const session = await context.newCDPSession(page);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 100, y: 700 }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 100, y: 350 }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await session.detach();
      }
      if (width <= 760) {
        const summary = page.locator(".filter-disclosure--icon > summary");
        await summary.scrollIntoViewIfNeeded();
        run.filter = await summary.evaluate((element) => {
          const box = element.getBoundingClientRect(),
            icon = element.querySelector("svg").getBoundingClientRect();
          return {
            centerError:
              Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2) +
              Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2),
          };
        });
        expect(run.filter.centerError).toBeLessThan(1);
        if (width === 390)
          await page.screenshot({ path: `${output}/filters-${name}.png` });
        await page.goto(`${base}/#/trends`);
        const ranking = page.locator(".filter-disclosure > summary");
        await ranking.scrollIntoViewIfNeeded();
        run.ranking = await ranking.evaluate((element) => {
          const box = element.getBoundingClientRect(),
            icon = element.querySelector("svg").getBoundingClientRect();
          return {
            inset: icon.x - box.x,
            centerError: Math.abs(
              box.y + box.height / 2 - icon.y - icon.height / 2,
            ),
            marker: getComputedStyle(element).listStyleType,
          };
        });
        expect(run.ranking.inset).toBeGreaterThanOrEqual(16);
        expect(run.ranking.centerError).toBeLessThan(1);
        expect(run.ranking.marker).toBe("none");
        if (width === 390)
          await page.screenshot({ path: `${output}/ranking-${name}.png` });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      expect(posts).toEqual([]);
      report.runs.push(run);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(
  `${report.runs.length} viewport/theme checks, ${report.runs.reduce((sum, run) => sum + run.switches.length, 0)} page switches; icons, menu motion, outside gestures and droplet alignment passed.`,
);
