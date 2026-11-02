// Measure real production images, including a fresh browser and blocked external image hosts.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import categories from "../shared/discovery-categories.json" with { type: "json" };

const base = process.env.IMAGE_BASE_URL || "http://localhost:4173";
const output = ".build/image-speed";
await mkdir(output, { recursive: true });
const catalog = await fetch(base + "/api/observatory/catalog").then((r) =>
  r.json(),
);
const all = catalog.data.pages.flatMap((page) => page.result.data.items);
const report = {
  at: new Date().toISOString(),
  base,
  catalog: {
    pages: catalog.data.pages.length,
    items: all.length,
    localAvatars: all.filter((repo) =>
      repo.owner.avatar_url.startsWith("/api/observatory/images/"),
    ).length,
    localCovers: all.filter((repo) =>
      repo.media?.image?.url.startsWith("/api/observatory/images/"),
    ).length,
    textOnly: all.filter((repo) => repo.media?.image === null).length,
    unresolved: all.filter((repo) => !repo.media).map((repo) => repo.full_name),
  },
  storage: (await fetch(base + "/api/admin/status").then((r) => r.json())).data
    .storage,
  runs: [],
};
const before = await readFile(`${output}/before.json`, "utf8").then(
  JSON.parse,
  () => null,
);
if (before)
  report.beforeRemoteImageMs = before.requests
    .filter((r) => r.type === "image" && r.url.startsWith("https:"))
    .map((r) => r.timing.responseEnd);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1100 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [],
      downloads = [],
      externalImages = [],
      metadata = [],
      switches = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/project-media?"))
        metadata.push(request.url());
    });
    // Cached project cards must remain readable when external image services are unreachable.
    await page.route("**/*", (route) => {
      const request = route.request();
      if (
        request.resourceType() === "image" &&
        new URL(request.url()).origin !== new URL(base).origin
      ) {
        externalImages.push(new URL(request.url()).hostname);
        return route.abort();
      }
      return route.continue();
    });
    page.on("requestfinished", (request) => {
      if (request.resourceType() === "image")
        downloads.push({
          url: request.url(),
          ms: request.timing().responseEnd,
        });
    });
    const catalogResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/observatory/catalog",
    );
    const start = performance.now();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".project-card.has-ai-summary").first().waitFor();
    const firstCardsMs = performance.now() - start;
    await (await catalogResponse).finished();
    await page.locator(".project-card").first().scrollIntoViewIfNeeded();
    await page
      .locator(".project-card img")
      .first()
      .evaluate((img) => img.decode());
    if (!(await page.locator(".category-filters").isVisible()))
      await page.getByRole("button", { name: "用途、语言与排序" }).click();
    // Wait for the bounded local image prefetch to finish before measuring switches.
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    for (const category of categories) {
      const change = await page.evaluate(
        async (label) => {
          const button = [
            ...document.querySelectorAll(".category-filters button"),
          ].find((element) => element.textContent?.trim() === label);
          if (!button) throw new Error("category button missing");
          const start = performance.now();
          button.click();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return {
            ms: performance.now() - start,
            cards: document.querySelectorAll(".project-card.has-ai-summary")
              .length,
            images: [...document.querySelectorAll(".project-card img")].map(
              (img) => ({
                url: img.currentSrc || img.src,
                complete: img.complete && img.naturalWidth > 0,
              }),
            ),
          };
        },
        category.id === "all" ? "全部" : category.name,
      );
      assert.equal(change.cards, 12);
      switches.push({ category: category.id, ...change });
      await page.locator(".project-card").first().scrollIntoViewIfNeeded();
    }
    await page.screenshot({
      path: `${output}/after-${width}.png`,
      fullPage: false,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      externalImages.filter((host) => host.startsWith("avatars")),
      [],
    );
    const unresolved = new Set(
      report.catalog.unresolved.map((name) => name.toLowerCase()),
    );
    assert.ok(
      metadata.every((url) =>
        unresolved.has(new URL(url).searchParams.get("repo").toLowerCase()),
      ),
      "cached image descriptors should not trigger metadata requests",
    );
    assert.ok(
      downloads.some((request) =>
        request.url.includes("/api/observatory/images/"),
      ),
    );
    report.runs.push({
      width,
      firstCardsMs,
      downloads,
      externalImages,
      metadata,
      errors,
      switches,
    });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/after.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      ...report,
      catalog: {
        ...report.catalog,
        unresolved: report.catalog.unresolved.length,
      },
      runs: report.runs.map((run) => ({
        ...run,
        downloads: {
          count: run.downloads.length,
          minMs: Math.min(...run.downloads.map((r) => r.ms)),
          maxMs: Math.max(...run.downloads.map((r) => r.ms)),
        },
        switches: run.switches.map((change) => ({
          category: change.category,
          ms: change.ms,
          images: change.images.length,
          complete: change.images.filter((image) => image.complete).length,
        })),
      })),
    },
    null,
    2,
  ),
);
