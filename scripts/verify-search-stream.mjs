import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { chatEnvelope, chatFixture } from "./chat-fixture.mjs";

const directory = "docs/screenshots/search-speed";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ reducedMotion: "reduce" });
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    if (String(args[0]) !== "/api/observatory/recommend")
      return nativeFetch(...args);
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          window.emitSearch = (value) =>
            controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  };
});
await page.route("**/api/observatory/**", (route) =>
  route.fulfill({ json: chatEnvelope({ cardGeneration: false, image: null }) }),
);
try {
  await page.goto(
    `${process.env.SEARCH_VERIFY_BASE_URL || "http://localhost:5173"}/#/ask`,
  );
  await page
    .getByRole("textbox", { name: "描述你的需求" })
    .fill("推荐几个便于上手的开源工具");
  await page.getByRole("button", { name: "发送需求", exact: true }).click();
  await page.waitForFunction(() => typeof window.emitSearch === "function");
  await page.evaluate(
    (value) => {
      window.emitSearch({
        type: "progress",
        message: "已独立核对 1 个项目，正在继续检索与核实…",
      });
      window.emitSearch(value);
    },
    {
      type: "partial",
      ...chatEnvelope({
        ...chatFixture(),
        selections: chatFixture().selections.slice(0, 1),
        verified: 1,
        partial: true,
      }),
    },
  );
  await page.locator(".recommendation-item").waitFor();
  for (const theme of ["light", "dark"])
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await page
        .locator(".chat-current-turn")
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow) throw new Error(`Overflow at ${theme}/${width}`);
      checks.push({ theme, width, overflow });
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `${directory}/partial-${theme}-${width}.png`,
        });
    }
  await page.getByRole("button", { name: "取消", exact: true }).click();
  if ((await page.locator(".recommendation-item").count()) !== 1)
    throw new Error("Cancellation removed a verified result");
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    `${directory}/checks.json`,
    JSON.stringify({ checks, errors, cancelledResultPreserved: true }, null, 2),
  );
  console.log(
    "10 partial-result layouts passed; cancellation preserves the verified card.",
  );
} finally {
  await browser.close();
}
