import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { chatFixture, chatEnvelope } from "./chat-fixture.mjs";
const directory = "docs/screenshots/ai-chat";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/observatory/recommend", async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const body = route.request().postDataJSON();
  const data = body.repo
    ? {
        plan: { summary: "", constraints: [], queries: [] },
        selections: [],
        searched: 1,
        verified: 1,
        answer: {
          repo: body.repo,
          text: "这个项目可以帮你在浏览器里画出带手绘风格的图。\n\n### 怎样开始\n\n- 打开项目提供的在线画板，就可以开始绘制。\n- 可以用它整理想法、画流程图，或者与别人一起协作。\n\n是否适合你的具体场景，还需要结合项目文档确认。",
          quotes: [
            "Virtual whiteboard for sketching hand-drawn like diagrams.",
          ],
          sourceUrl: `https://github.com/${body.repo}`,
          fetchedAt: "2026-11-01T00:00:00Z",
          source: "live",
        },
      }
    : chatFixture(body.turns.length > 1);
  await route
    .fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({ type: "progress", message: "正在核对 README…" }) +
        "\n" +
        JSON.stringify({ type: "result", ...chatEnvelope(data) }) +
        "\n",
    })
    .catch(() => {});
});
await page.route("**/api/observatory/project-media?*", (route) =>
  route.fulfill({ json: chatEnvelope({ image: null }) }),
);
const capture = async (name, theme, width) => {
  await page.waitForTimeout(120);
  const actual = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  if (actual > width)
    throw new Error(`${name} ${theme} ${width} overflow ${actual}`);
  const dock = await page.locator(".chat-composer-dock").boundingBox();
  if (
    dock.x < -1 ||
    dock.x + dock.width > width + 1 ||
    dock.y + dock.height > 1001
  )
    throw new Error("composer out of viewport");
  checks.push({ name, theme, width, scrollWidth: actual });
  if ([390, 1440].includes(width))
    await page.screenshot({
      path: `${directory}/${name}-${theme}-${width}.png`,
    });
};
try {
  await page.goto("http://localhost:5173/#/ask");
  await page.getByRole("heading", { name: "你想用开源，做点什么？" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "切换深色主题", exact: true })
        .click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await capture("welcome", theme, width);
    }
  }
  await page.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await page
    .getByRole("textbox", { name: "描述你的需求" })
    .fill("我想用开源做点东西，有哪些容易上手的工具？");
  await page.getByRole("button", { name: "发送需求", exact: true }).click();
  await page.locator(".chat-working").waitFor();
  await capture("working", "light", 1440);
  await page.locator(".recommendation-item").first().waitFor();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "切换深色主题", exact: true })
        .click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .locator(".chat-current-turn")
        .evaluate((el) =>
          el.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      await capture("reply", theme, width);
    }
  }
  await page
    .getByRole("textbox", { name: "继续对话" })
    .fill("这些哪个更容易上手？");
  await page.getByRole("textbox", { name: "继续对话" }).press("Enter");
  await page
    .locator(".chat-current-turn .recommendation-item")
    .first()
    .waitFor();
  await capture("followup", "dark", 1440);
  await page.setViewportSize({ width: 390, height: 1000 });
  await capture("followup", "dark", 390);
  await page
    .locator(".chat-current-turn .trend-card-actions button")
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: /^向 AI 提问 / })
    .fill("这个项目怎么用？");
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "切换浅色主题", exact: true })
        .evaluate((el) => el.click());
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await capture("quick-read-ask", theme, width);
      const form = await dialog.locator(".quick-read-ask").boundingBox();
      const modal = await dialog.boundingBox();
      if (
        form.x < modal.x ||
        form.x + form.width > modal.x + modal.width ||
        form.y + form.height > modal.y + modal.height
      )
        throw new Error("project input outside modal");
    }
  }
  await dialog.getByRole("button", { name: "发送项目问题" }).click();
  await page.locator(".project-answer-body").waitFor();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "切换深色主题", exact: true })
        .click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await capture("project-reply", theme, width);
    }
  }
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ fixture: true, checks, errors }, null, 2),
  );
  if (errors.length) throw new Error(errors.join(";"));
  console.log(JSON.stringify({ checks: checks.length, errors }));
} finally {
  await browser.close();
}
