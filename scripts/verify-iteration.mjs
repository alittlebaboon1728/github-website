import { chromium } from "@playwright/test";
import { mkdir, writeFile, copyFile } from "node:fs/promises";

const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:5173";
const directory = ".build/iteration-screenshots";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
const errors = [],
  layouts = [],
  endpoints = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  for (const name of ["status", "activity", "trends"]) {
    const response = await page.request.get(`${base}/api/observatory/${name}`);
    const body = await response.json();
    endpoints.push({
      name,
      status: response.status(),
      source: body.source,
      fetchedAt: body.fetchedAt,
      error: body.error,
      count:
        name === "activity"
          ? body.data?.events.length
          : body.data?.repositories?.length,
      state:
        name === "status"
          ? body.data
          : name === "trends"
            ? {
                ready: body.data?.growth.ready,
                persistence: body.data?.persistence,
              }
            : undefined,
    });
  }
  for (const theme of ["light", "dark"]) {
    await page.goto(base);
    await page.evaluate(
      (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
      theme === "dark",
    );
    await page.reload();
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      throw new Error(`Theme did not apply: ${theme}`);
    for (const [name, path] of [
      ["home", "/discover"],
      ["trends", "/trends"],
      ["history", "/trends?view=growth"],
    ]) {
      await page.goto(`${base}/#${path}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page
        .locator(".skeleton-grid")
        .waitFor({ state: "detached", timeout: 20000 })
        .catch(() => {});
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1100 });
        await page.screenshot({
          path: `${directory}/${name}-${theme}-${width}.png`,
        });
        const actualWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        layouts.push({
          page: name,
          theme,
          width,
          actualWidth,
          fits: actualWidth <= width,
        });
      }
      if (name === "home" && theme === "light")
        await page.screenshot({
          path: `${directory}/home-light-full.png`,
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${base}/#/project/excalidraw/excalidraw`);
  await page
    .getByRole("heading", { name: "本站编辑评价", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "本站编辑评价", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/editorial-dark-desktop.png` });
  await page.goto(`${base}/#/discover`);
  await page.locator(".project-card .exhibit-visual").first().click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: `${directory}/quick-read-dark-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${directory}/quick-read-dark-mobile.png` });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("搜索模式", { exact: true }).selectOption("ai");
  await page
    .getByRole("textbox", { name: "搜索 GitHub 公开项目" })
    .fill("推荐几个适合个人用的开源笔记工具，能离线，最好支持中文。");
  await page.getByRole("button", { name: "搜索项目", exact: true }).click();
  await page
    .getByRole("heading", { name: "AI 搜索尚未配置", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${directory}/ai-unconfigured-dark-desktop.png`,
  });
  await mkdir("docs/screenshots/iteration", { recursive: true });
  for (const name of [
    "home-light-full",
    "home-light-390",
    "home-dark-1440",
    "home-dark-390",
    "trends-light-1440",
    "history-dark-1440",
    "editorial-dark-desktop",
    "quick-read-dark-desktop",
    "quick-read-dark-mobile",
    "ai-unconfigured-dark-desktop",
  ])
    await copyFile(
      `${directory}/${name}.png`,
      `docs/screenshots/iteration/${name}.png`,
    );
  const report = {
    capturedAt: new Date().toISOString(),
    base,
    endpoints,
    layouts,
    pageErrors: errors,
  };
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        layouts: layouts.length,
        overflows: layouts.filter((l) => !l.fits),
        pageErrors: errors,
        endpoints,
      },
      null,
      2,
    ),
  );
  if (layouts.some((l) => !l.fits) || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
