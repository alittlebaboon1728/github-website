import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.UI_STYLE_BASE_URL || "http://127.0.0.1:4173";
const output = "skills/silver-liquid-glass-ui/assets/visual-reference";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const tokens = [
  "page",
  "card",
  "text",
  "secondary",
  "muted",
  "accent",
  "forest",
  "sage",
  "soft",
  "border",
  "feature-bg",
  "feature-border",
  "feature-accent",
  "glass-clear",
  "glass-panel",
  "glass-sheet",
  "glass-hover",
  "glass-edge",
  "glass-highlight",
  "glass-lowlight",
  "glass-selected",
  "glass-specular",
  "glass-sheen",
  "glass-light",
  "glass-rim",
  "glass-control-shadow",
  "glass-panel-shadow",
  "glass-blur",
  "glass-panel-blur",
  "glass-backdrop",
  "lgh-blur",
  "lgh-brightness",
  "lgh-top-light",
  "lgh-bottom-shade",
  "lgh-shadow",
  "control-height",
  "control-padding-inline",
  "control-gap",
  "panel-radius",
];
const selectors = [
  "body",
  ".site-header-inner",
  ".site-brand strong",
  ".site-navigation",
  ".site-navigation > a",
  ".header-control",
  ".observatory-content",
  ".discovery-hero",
  ".discovery-hero h1",
  ".hero-title-english",
  ".project-search",
  ".project-search-icon",
  ".gh-pulse",
  ".project-grid",
  ".trend-project-card",
  ".trend-card-content",
  ".trend-card-cover",
  ".trend-card-cover img",
  ".trend-author-avatar",
  ".gallery-title h3",
  ".exhibit-description",
  ".trend-card-author",
  ".trend-card-topics span",
  ".trend-card-footer",
  ".filter-disclosure > summary",
  ".category-filters",
  ".glass-tabs",
  ".ranking-row",
  ".ranking-project-title h2",
  ".trial-feature",
  ".trial-feature-description",
  ".trial-poster",
  ".trial-library-card",
  ".trial-workspace",
  ".chat-workspace",
  ".followup-form",
  ".quick-read-dialog",
  ".quick-read-bottom",
  ".quick-read-pager",
];
const properties = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "color",
  "backgroundColor",
  "backgroundImage",
  "border",
  "borderRadius",
  "boxShadow",
  "backdropFilter",
  "padding",
  "gap",
  "width",
  "maxWidth",
  "height",
  "minHeight",
  "display",
  "gridTemplateColumns",
  "gridAutoRows",
  "position",
  "top",
  "zIndex",
  "overflow",
  "transition",
];
const report = {
  date: "2026-11-09",
  source: "Open Source Observatory / e26957a",
  browser: "Edge Chromium",
  live: true,
  note: "Actual GET data. Browser POST blocked; no generation. Computed styles reflect final cascade, not each historical declaration.",
  runs: [],
};
try {
  for (const width of [1440, 390]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
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
        return route.fulfill({
          status: 503,
          json: { error: "UI style capture does not generate content" },
        });
      });
      const run = {
        width,
        theme: dark ? "dark" : "light",
        tokens: {},
        pages: [],
        errors,
        posts,
      };
      const capture = async (name, path, selector) => {
        if (path)
          await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
        if (path === "/admin")
          await expect(page.locator(".admin-metrics")).toBeVisible({
            timeout: 15000,
          });
        await page.evaluate(() => document.fonts.ready);
        if (selector)
          await page.locator(selector).first().scrollIntoViewIfNeeded();
        // Give observers a frame after layout, without waiting for upstream work.
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const styles = await page.evaluate(
          ({ selectors, properties }) =>
            Object.fromEntries(
              selectors.flatMap((selector) => {
                const element = document.querySelector(selector);
                if (!element) return [];
                const style = getComputedStyle(element);
                return [
                  [
                    selector,
                    Object.fromEntries(
                      properties.map((property) => [property, style[property]]),
                    ),
                  ],
                ];
              }),
            ),
          {
            selectors: [
              ...selectors,
              ".observatory-shell",
              ".reader-header",
              ".reader-overview",
              ".admin-shell",
              ".admin-header",
              ".admin-metrics",
              ".admin-panel",
            ],
            properties,
          },
        );
        const pageTokens = await page.evaluate(
          (tokens) =>
            Object.fromEntries(
              tokens.map((token) => [
                token,
                getComputedStyle(document.documentElement)
                  .getPropertyValue(`--${token}`)
                  .trim(),
              ]),
            ),
          tokens,
        );
        const filename = `${name}-${run.theme}-${width}.png`;
        await page.screenshot({ path: `${output}/${filename}` });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        run.pages.push({
          name,
          screenshot: filename,
          tokens: pageTokens,
          styles,
        });
      };
      await capture("home", "/#/discover");
      run.tokens = await page.evaluate(
        (tokens) =>
          Object.fromEntries(
            tokens.map((token) => [
              token,
              getComputedStyle(document.documentElement)
                .getPropertyValue(`--${token}`)
                .trim(),
            ]),
          ),
        tokens,
      );
      await expect(
        page.locator(".project-card.has-ai-summary").first(),
      ).toBeVisible({ timeout: 15000 });
      await capture("cards", null, ".project-browser-controls");
      await page.locator(".project-card .gallery-title").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture("reader");
      await page.keyboard.press("Escape");
      if (width <= 820) {
        await page.evaluate(() => scrollTo(0, 0));
        await page
          .getByRole("button", { name: "打开导航", exact: true })
          .click();
        await capture("navigation");
        await page
          .getByRole("button", { name: "关闭导航", exact: true })
          .click();
      }
      await capture("rankings", "/#/trends", ".ranking-toolbar");
      await capture("trials", "/#/stories");
      await capture("trial-reading", "/#/trial/markedjs/marked");
      await capture("conversation", "/#/ask");
      await capture("admin", "/admin");
      expect(errors).toEqual([]);
      expect(posts).toEqual([]);
      report.runs.push(run);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  `${output}/computed-styles.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  `${report.runs.reduce((sum, run) => sum + run.pages.length, 0)} screenshots and computed style samples saved. No POSTs or page errors.`,
);
