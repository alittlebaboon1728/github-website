import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.ADMIN_BASE_URL || "http://localhost:4173";
const output = ".build/admin";
await mkdir(output, { recursive: true });
const initialResponse = await fetch(`${base}/api/admin/status`);
assert.equal(initialResponse.status, 200);
const initial = (await initialResponse.json()).data;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { at: new Date().toISOString(), base, files: initial.storage.files, cards: initial.storage.cards, preparedPages: initial.library.scopes.flatMap((scope) => scope.prepared).filter((page) => page.complete || page.end).length, runs: [], controls: null };
let changedWorker = false;
try {
  for (const width of [1440, 390]) for (const dark of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1100 }, reducedMotion: "reduce" });
    await context.addInitScript((value) => localStorage.setItem("gh-design-dark", JSON.stringify(value)), dark);
    const page = await context.newPage();
    const errors = [], posts = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()); });
    const start = performance.now();
    await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
    await page.locator(".admin-metrics").waitFor();
    const readyMs = performance.now() - start;
    await page.getByLabel("每 5 秒自动读取").uncheck();
    assert.ok((await page.locator(".admin-metrics").innerText()).includes(String(initial.storage.cards)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator(".admin-scope").count(), initial.library.scopes.length);
    await page.screenshot({ path: `${output}/${width}-${dark ? "dark" : "light"}.png` });
    await page.getByLabel("查找分类或关键词").fill("数据与后端");
    assert.equal(await page.locator(".admin-scope").count(), 1);
    await page.locator(".admin-page-progress summary").click();
    assert.ok((await page.locator(".admin-page-progress").innerText()).includes("第 3 页"));
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, []);
    report.runs.push({ width, dark, readyMs, errors, posts });
    await context.close();
  }
  if (initial.library.enabled) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/admin`);
    await page.locator(".admin-metrics").waitFor();
    await page.getByLabel("每 5 秒自动读取").uncheck();
    if (initial.library.running) {
      changedWorker = true;
      await page.getByRole("button", { name: "暂停后台更新", exact: true }).click();
      await page.getByRole("button", { name: "恢复后台更新", exact: true }).waitFor();
      const paused = await fetch(`${base}/api/admin/status`).then((response) => response.json());
      assert.equal(paused.data.library.running, false);
      const discovery = await fetch(`${base}/api/github/search?q=topic%3Adatabase&sort=stars&page=1`).then((response) => response.json());
      assert.equal(discovery.data.items.length, 12);
      assert.equal(Object.keys(discovery.data.cards).length, 12);
      await page.getByRole("button", { name: "恢复后台更新", exact: true }).click();
      await page.getByRole("button", { name: "暂停后台更新", exact: true }).waitFor();
      const resumed = await fetch(`${base}/api/admin/status`).then((response) => response.json());
      assert.equal(resumed.data.library.running, true);
      changedWorker = false;
      report.controls = { pause: true, resume: true, cachedChineseWhilePaused: 12 };
    }
    await context.close();
  }
} finally {
  if (changedWorker) {
    const current = await fetch(`${base}/api/admin/status`).then((response) => response.json());
    await fetch(`${base}/api/admin/library`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": current.data.token }, body: JSON.stringify({ action: "resume" }) });
  }
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
