import { test, expect } from "@playwright/test";
import { catalog, trial } from "./fixtures/trials.mjs";
const entries = [
  {
    ...trial,
    repo: "markedjs/marked",
    name: "marked",
    title: "把 Markdown 变成网页内容",
    cover: undefined,
    kind: "interactive",
  },
  {
    ...trial,
    repo: "jqlang/jq",
    name: "jq",
    title: "从 JSON 中提取版本号",
    cover: undefined,
    kind: "interactive",
  },
];
test.beforeEach(async ({ page }) => {
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/trials")
      ? { ...catalog, trials: entries }
      : path.endsWith("/status")
        ? { cardGeneration: false }
        : path.endsWith("/project-media")
          ? { image: null }
          : path.endsWith("/trends")
            ? { repositories: [], growth: { ready: false, items: [] } }
            : { events: [] };
    return route.fulfill({ json: { data } });
  });
  await page.route("**/api/github/**", (route) =>
    route.fulfill({
      json: { data: { items: [], total_count: 0, incomplete_results: false } },
    }),
  );
});

test("home and library share the carousel, project diagrams and working destinations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  for (const url of ["/#/stories", "/#/discover"]) {
    await page.goto(url);
    const carousel = page.getByRole("region", { name: "精选项目试用" });
    await expect(
      carousel.locator(".trial-carousel-slide:not([data-clone])"),
    ).toHaveCount(3);
    await carousel
      .getByRole("button", { name: "查看 marked 试用横幅" })
      .click();
    await expect(carousel.locator('[aria-hidden="false"] a')).toHaveAttribute(
      "href",
      "#/trial/markedjs/marked",
    );
    await expect(
      carousel.locator('[aria-hidden="false"] figure'),
    ).toHaveAccessibleName(/Markdown.*本周更新/);
    await carousel.getByRole("button", { name: "查看 jq 试用横幅" }).click();
    await expect(carousel.locator('[aria-hidden="false"] a')).toHaveAttribute(
      "href",
      "#/trial/jqlang/jq",
    );
    await expect(
      carousel.locator('[aria-hidden="false"] figure'),
    ).toHaveAccessibleName(/JSON.*1.4.2/);
    await carousel
      .getByRole("button", { name: "查看 Excalidraw 试用横幅" })
      .click();
    await expect(carousel.locator('[aria-hidden="false"] a')).toHaveAttribute(
      "href",
      "#/project/excalidraw/excalidraw",
    );
    await expect(
      carousel.getByRole("button", { name: /自动轮播/ }),
    ).toHaveCount(0);
    await carousel.locator(".trial-carousel-track").focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      carousel.locator('.trial-carousel-dot[aria-pressed="true"]'),
    ).toHaveAttribute("aria-label", "查看 marked 试用横幅");
  }
  await page.goto("/#/stories");
  await expect(
    page.locator(".trial-library-card .illustration-document"),
  ).toHaveCount(1);
  await expect(
    page.locator(".trial-library-card .illustration-data"),
  ).toHaveCount(1);
  await expect(page.locator(".trial-library-symbol")).toHaveCount(0);
  await page
    .locator(".trial-library-card")
    .filter({ hasText: "markedjs/marked" })
    .click();
  await expect(page).toHaveURL(/#\/trial\/markedjs\/marked$/);
  expect(posts).toEqual([]);
});

test("rotation pauses for hover and keyboard focus, and native mobile swiping keeps selection", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/#/stories");
  const carousel = page.getByRole("region", { name: "精选项目试用" });
  const track = carousel.locator(".trial-carousel-track");
  const selected = carousel.locator('.trial-carousel-dot[aria-pressed="true"]');
  await expect(carousel.getByRole("button")).toHaveCount(3);
  await expect(carousel.getByRole("button")).toHaveText(["", "", ""]);
  await carousel.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(carousel).toHaveAttribute("data-rotation", "playing");
  await page.clock.fastForward(6800);
  await expect(selected).toHaveAttribute("aria-label", "查看 marked 试用横幅");
  await track.hover();
  await expect(carousel).toHaveAttribute("data-rotation", "paused");
  await page.clock.fastForward(14000);
  await expect(selected).toHaveAttribute("aria-label", "查看 marked 试用横幅");
  await page.mouse.move(0, 0);
  await track.focus();
  await expect(carousel).toHaveAttribute("data-rotation", "paused");
  await page.clock.fastForward(14000);
  await expect(selected).toHaveAttribute("aria-label", "查看 marked 试用横幅");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await track.evaluate((element) => {
    element.scrollLeft = element.clientWidth * 3;
  });
  await expect(selected).toHaveAttribute("aria-label", "查看 jq 试用横幅");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(selected).toHaveAttribute("aria-label", "查看 jq 试用横幅");
});

test("last slide keeps moving left into the first slide, then normalizes without a reverse animation", async ({
  page,
}) => {
  await page.goto("/#/stories");
  const carousel = page.getByRole("region", { name: "精选项目试用" });
  const track = carousel.locator(".trial-carousel-track");
  await carousel.getByRole("button", { name: "查看 jq 试用横幅" }).click();
  await expect
    .poll(() =>
      track.evaluate((el) => Math.abs(el.scrollLeft - 3 * el.clientWidth)),
    )
    .toBeLessThan(1);
  await page.waitForTimeout(220);
  const sampling = track.evaluate(
    (el) =>
      new Promise<number[]>((resolve) => {
        const positions = [el.scrollLeft / el.clientWidth];
        const record = () => positions.push(el.scrollLeft / el.clientWidth);
        el.addEventListener("scroll", record);
        setTimeout(() => {
          el.removeEventListener("scroll", record);
          resolve(positions);
        }, 1400);
      }),
  );
  await carousel
    .getByRole("button", { name: "查看 Excalidraw 试用横幅" })
    .click();
  const positions = await sampling;
  expect(Math.max(...positions)).toBeGreaterThan(3.9);
  const normalization = positions.findIndex(
    (value, i) => i > 0 && value < positions[i - 1] - 0.05,
  );
  expect(normalization).toBeGreaterThan(0);
  expect(positions[normalization - 1]).toBeGreaterThan(3.9);
  expect(positions[normalization]).toBeCloseTo(1, 1);
  expect(
    positions
      .slice(1, normalization)
      .every((value, i) => value >= positions[i] - 0.01),
  ).toBe(true);
  await expect
    .poll(() => track.evaluate((el) => el.scrollLeft / el.clientWidth))
    .toBeCloseTo(1, 1);
  await expect(carousel.locator('[aria-hidden="false"] a')).toHaveAttribute(
    "href",
    "#/project/excalidraw/excalidraw",
  );
  await carousel.getByRole("button", { name: "查看 marked 试用横幅" }).click();
  await expect(
    carousel.locator('.trial-carousel-dot[aria-pressed="true"]'),
  ).toHaveAttribute("aria-label", "查看 marked 试用横幅");
});

test("empty or unavailable catalogs keep the native trial usable", async ({
  page,
}) => {
  await page.route("**/api/observatory/trials**", (route) =>
    route.fulfill({ status: 503, json: { error: "暂时无法读取试用" } }),
  );
  await page.goto("/#/stories");
  await expect(page.getByRole("alert")).toContainText("暂时无法读取试用");
  await expect(page.locator(".trial-carousel-slide")).toHaveCount(1);
  await expect(page.locator(".trial-carousel-dots")).toHaveCount(0);
  await expect(page.locator(".trial-feature")).toHaveAttribute(
    "href",
    "#/project/excalidraw/excalidraw",
  );
  await page.route("**/api/observatory/trials**", (route) =>
    route.fulfill({ json: { data: { ...catalog, trials: [] } } }),
  );
  await page.getByRole("button", { name: "重新读取" }).click();
  await expect(page.locator(".trial-library-empty")).toBeVisible();
});
