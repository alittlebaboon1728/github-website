import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const requests = [];
page.on("request", (request) => {
  if (request.url().endsWith("/api/observatory/cards/pages"))
    requests.push(request.postDataJSON());
});
try {
  await page.goto("http://localhost:5173/#/discover");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".project-card.has-ai-summary").length >= 36,
    null,
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "加载更多项目", exact: true }).click();
  console.log(JSON.stringify({ stage: "page-four-requested", requests }));
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".project-card.has-ai-summary").length >= 48,
    null,
    { timeout: 180000 },
  );
  const result = {
    generated: await page.locator(".project-card.has-ai-summary").count(),
    requests,
  };
  if (
    requests.some((r) => r.page > 4) ||
    !requests.some((r) => r.page === 4 && r.count === 1)
  )
    throw new Error("unexpected pagination");
  await page
    .locator(".project-card")
    .nth(36)
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await page.screenshot({
    path: "docs/screenshots/generated-cards/page-four.png",
  });
  await writeFile(
    "docs/screenshots/generated-cards/pagination.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
