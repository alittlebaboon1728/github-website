import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { chatEnvelope, chatFixture } from "../scripts/chat-fixture.mjs";

async function mockChatServices(page: Page) {
  await page.route("**/api/observatory/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status"))
      return route.fulfill({
        json: chatEnvelope({ aiConfigured: true, cardGeneration: false }),
      });
    if (path.endsWith("/project-media"))
      return route.fulfill({ json: chatEnvelope({ image: null }) });
    return route.fulfill({
      status: 503,
      json: { error: "测试中未启用此服务。" },
    });
  });
}
test.beforeEach(async ({ page }) => {
  await mockChatServices(page);
});

test("chat welcome waits for submission, supports multiline and IME, and keeps every reply only within the current chat", async ({
  page,
}) => {
  const requests: { turns: string[] }[] = [];
  await page.route("**/api/observatory/recommend", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          ...chatEnvelope(chatFixture(body.turns.length > 1)),
        }) + "\n",
    });
  });
  await page.goto("/#/ask");
  await expect(
    page.getByRole("heading", { name: "你想用开源，做点什么？" }),
  ).toBeVisible();
  await expect(
    page.locator(".gallery-heading, .project-search, .observatory-footer"),
  ).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await expect(
    page.locator(
      ".chat-composer-note, .chat-starters, .followup-suggestions, .chat-enter-hint",
    ),
  ).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "描述你的需求" });
  await input.fill("我想找开源工具");
  await input.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(requests).toHaveLength(0);
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("我想找开源工具\n");
  expect(requests).toHaveLength(0);
  await input.fill("我想找开源工具\n最好容易上手");
  await input.press("Enter");
  await expect(
    page.locator(".chat-current-turn .recommendation-item"),
  ).toHaveCount(4);
  await expect(page.locator(".chat-user-message p")).toHaveText(
    "我想找开源工具\n最好容易上手",
  );
  const firstSummary = await page.locator(".chat-answer-summary").textContent();
  await page
    .getByRole("textbox", { name: "继续对话" })
    .fill("优先考虑本地使用");
  await page.getByRole("textbox", { name: "继续对话" }).press("Enter");
  await expect(page.locator(".chat-turn")).toHaveCount(2);
  await expect(
    page.locator(".chat-past-turn .recommendation-item"),
  ).toHaveCount(4);
  await expect(
    page.locator(".chat-current-turn .recommendation-item"),
  ).toHaveCount(2);
  await expect(page.getByRole("textbox", { name: "继续对话" })).toBeFocused();
  await expect(page.locator(".chat-past-turn .chat-answer-summary")).toHaveText(
    firstSummary!,
  );
  expect(requests.at(-1)!.turns).toEqual([
    "我想找开源工具\n最好容易上手",
    "优先考虑本地使用",
  ]);
  const requestCount = requests.length;
  expect(new URLSearchParams(page.url().split("?")[1] || "").has("turns")).toBe(
    false,
  );
  await page.getByRole("link", { name: "新对话", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你想用开源，做点什么？" }),
  ).toBeVisible();
  await expect(page.locator(".chat-turn")).toHaveCount(0);
  expect(requests).toHaveLength(requestCount);
});

test("live progress uses streamed statuses, supports stop and retry, and animates actual returned cards", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch;
    const bridge = window as unknown as {
      emitChat: (value: unknown) => void;
      chatCalls: number;
    };
    bridge.chatCalls = 0;
    window.fetch = async (...args) => {
      if (String(args[0]) !== "/api/observatory/recommend")
        return nativeFetch(...args);
      bridge.chatCalls++;
      let output: ReadableStreamDefaultController<Uint8Array>;
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          output = controller;
        },
      });
      bridge.emitChat = (event) =>
        output.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      bridge.emitChat({ type: "progress", message: "正在检索公开仓库…" });
      const signal = (args[1] as RequestInit).signal;
      signal?.addEventListener("abort", () => {
        try {
          output.error(new DOMException("Aborted", "AbortError"));
        } catch {}
      });
      return new Response(body, {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    };
  });
  await page.goto("/#/ask");
  await page
    .getByRole("textbox", { name: "描述你的需求" })
    .fill("找个轻量的画图工具");
  await page.getByRole("button", { name: "发送需求" }).click();
  await expect(page.getByRole("status")).toContainText("正在检索公开仓库");
  const initialCalls = await page.evaluate(
    () => (window as unknown as { chatCalls: number }).chatCalls,
  );
  await expect(page.locator(".chat-loading-card")).toHaveCount(2);
  await page.evaluate(() =>
    (window as unknown as { emitChat: (value: unknown) => void }).emitChat({
      type: "progress",
      message: "正在核对 4 份 README…",
    }),
  );
  await expect(page.getByRole("status")).toContainText("正在核对 4 份 README");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已取消本次检索" }),
  ).toBeVisible();
  await expect(page.locator(".recommendation-item")).toHaveCount(0);
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("正在检索公开仓库");
  await page.evaluate(
    (value) =>
      (window as unknown as { emitChat: (value: unknown) => void }).emitChat(
        value,
      ),
    { type: "result", ...chatEnvelope(chatFixture()) },
  );
  await expect(page.locator(".recommendation-item")).toHaveCount(4);
  await expect(page.locator(".chat-working")).toHaveCount(0);
  expect(
    await page
      .locator(".chat-card-enter")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("chat-card-in");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".chat-card-enter")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => (window as unknown as { chatCalls: number }).chatCalls,
    ),
  ).toBe(initialCalls + 1);
});

test("chat cards fit mobile and desktop, latest reply stays above the composer, and an ordinary title opens quick read", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/observatory/recommend", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({ type: "result", ...chatEnvelope(chatFixture()) }) +
        "\n",
    }),
  );
  await page.goto("/#/ask");
  await page
    .getByRole("textbox", { name: "描述你的需求" })
    .fill("给开发提提速");
  await page.getByRole("button", { name: "发送需求" }).click();
  await expect(page.locator(".recommendation-item")).toHaveCount(4);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const dock = await page.locator(".chat-composer-dock").boundingBox();
    expect(dock!.x).toBeGreaterThanOrEqual(0);
    expect(dock!.x + dock!.width).toBeLessThanOrEqual(width);
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(901);
  }
  await page.getByRole("button", { name: "滚动到最新回复" }).click();
  await expect(page.locator(".chat-condition-editor")).toBeInViewport();
  const editor = await page.locator(".chat-condition-editor").boundingBox();
  const dock = await page.locator(".chat-composer-dock").boundingBox();
  expect(editor!.y + editor!.height).toBeLessThanOrEqual(dock!.y);
  const url = page.url();
  await page.locator(".recommendation-item .gallery-title").nth(1).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(url);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "打开项目详情", exact: true }),
  ).toHaveCount(0);
});

test("empty recommendations invite refinement, and the eight-turn limit offers a fresh chat", async ({
  page,
}) => {
  await page.route("**/api/observatory/recommend", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          ...chatEnvelope(chatFixture(false, true)),
        }) + "\n",
    }),
  );
  const turns = Array.from({ length: 8 }, (_, i) => `第 ${i + 1} 轮需求`);
  await page.goto(
    `/#/ask?${new URLSearchParams({ turns: JSON.stringify(turns), overrides: "[]" })}`,
  );
  await expect(page.locator(".chat-empty-results")).toBeVisible();
  await expect(page.locator(".recommendation-item")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "继续对话" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "发送需求", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "新对话", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "描述你的需求" }),
  ).toBeEnabled();
});

test("quick read sends the first project question, clears drafts between projects and starts an isolated chat", async ({
  page,
}) => {
  const requests: { turns: string[]; repo?: string }[] = [];
  await page.route("**/api/observatory/recommend", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const data = body.repo
      ? {
          plan: { summary: "", constraints: [], queries: [] },
          selections: [],
          searched: 1,
          verified: 1,
          answer: {
            repo: body.repo,
            text: `这是 **${body.repo}** 的回答。\n\n仅依据项目原文说明。`,
            quotes: ["Works offline on Windows and Linux."],
            sourceUrl: `https://github.com/${body.repo}`,
            fetchedAt: "2026-11-01T00:00:00Z",
            source: "live",
          },
        }
      : chatFixture();
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: JSON.stringify({ type: "result", ...chatEnvelope(data) }) + "\n",
    });
  });
  await page.goto("/#/ask");
  await page
    .getByRole("textbox", { name: "描述你的需求" })
    .fill("找点开源项目");
  await page.getByRole("button", { name: "发送需求" }).click();
  await expect(page.locator(".recommendation-item")).toHaveCount(4);
  await expect(page.locator(".ask-project-button")).toHaveCount(0);
  const names = chatFixture().selections.map(
    (selection: { repo: { full_name: string } }) => selection.repo.full_name,
  );
  const beforeProject = requests.length;
  await page
    .locator(".recommendation-item .trend-card-actions button")
    .nth(1)
    .click();
  const dialog = page.getByRole("dialog");
  const question = () => dialog.getByRole("textbox", { name: /^向 AI 提问 / });
  await expect(question()).toHaveAttribute(
    "aria-label",
    `向 AI 提问 ${names[1]}`,
  );
  await expect(question()).not.toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "发送项目问题" }),
  ).toBeDisabled();
  await question().fill("旧项目草稿");
  await dialog.getByRole("button", { name: "下一个项目" }).click();
  await expect(question()).toHaveValue("");
  await expect(question()).toHaveAttribute(
    "aria-label",
    `向 AI 提问 ${names[2]}`,
  );
  await dialog.getByRole("button", { name: "上一个项目" }).click();
  await expect(question()).toHaveValue("");
  await question().fill("   ");
  await expect(
    dialog.getByRole("button", { name: "发送项目问题" }),
  ).toBeDisabled();
  await question().fill("怎么使用？");
  await question().evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(requests).toHaveLength(beforeProject);
  await dialog.getByRole("button", { name: "发送项目问题" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".chat-project-context")).toContainText(names[1]);
  await expect(page.locator(".chat-turn")).toHaveCount(1);
  await expect(page.locator(".chat-user-message p")).toHaveText("怎么使用？");
  await expect(
    page.locator(".chat-starters, .followup-suggestions, .chat-composer-note"),
  ).toHaveCount(0);
  await expect(page.locator(".project-answer-body")).toContainText(names[1]);
  expect(requests.at(-1)!.repo).toBe(names[1]);
  await expect(
    page.locator(".chat-condition-editor, .recommendation-item"),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "继续对话" }).fill("可以离线吗？");
  await page.getByRole("textbox", { name: "继续对话" }).press("Enter");
  await expect(page.locator(".project-answer-body")).toHaveCount(2);
  expect(requests.at(-1)).toMatchObject({
    repo: names[1],
    turns: ["怎么使用？", "可以离线吗？"],
  });
  await page.locator(".chat-current-turn .chat-sources summary").click();
  await expect(
    page.locator(".chat-current-turn .chat-sources blockquote"),
  ).toHaveText("Works offline on Windows and Linux.");
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "移除项目上下文" }).click();
  await expect(page.locator(".chat-project-context")).toHaveCount(0);
  const count = requests.length;
  await page.goto(
    `/#/ask?${new URLSearchParams({ repo: names[0], turns: JSON.stringify(["怎么使用？"]), overrides: "[]" })}`,
  );
  await expect(page.locator(".project-answer-body")).toContainText(names[0]);
  expect(requests.length).toBeGreaterThan(count);
  await expect(page.locator(".project-answer-body")).not.toContainText(
    names[1],
  );
});

test("external searches replace the active chat, same-text searches start fresh, and refresh never replays history", async ({
  page,
}) => {
  const requests: { turns: string[]; repo?: string; overrides: unknown[] }[] =
    [];
  await page.route("**/api/observatory/recommend", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({ type: "result", ...chatEnvelope(chatFixture()) }) +
        "\n",
    });
  });
  await page.goto("/#/ask?repo=org/notes");
  await page.getByRole("textbox", { name: "描述你的需求" }).fill("怎么使用？");
  await page.getByRole("button", { name: "发送需求" }).click();
  await expect.poll(() => requests.at(-1)?.repo).toBe("org/notes");
  await expect(page.locator(".chat-working")).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    const count = requests.length;
    await page.keyboard.press("Control+k");
    await page
      .getByRole("combobox", { name: "快捷搜索模式" })
      .selectOption("ai");
    await page
      .getByRole("textbox", { name: "全站项目搜索" })
      .fill("我想找一个开源画图工具");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "搜索项目" })
      .click();
    await expect.poll(() => requests.length).toBeGreaterThan(count);
    await expect(page.locator(".chat-turn")).toHaveCount(1);
    await expect(page.locator(".chat-project-context")).toHaveCount(0);
    expect(requests.at(-1)).toEqual({
      turns: ["我想找一个开源画图工具"],
      overrides: [],
    });
    await expect(
      page.locator(".chat-current-turn .recommendation-item"),
    ).toHaveCount(4);
    await page.getByRole("textbox", { name: "继续对话" }).fill("最好可以离线");
    await page.getByRole("textbox", { name: "继续对话" }).press("Enter");
    await expect(page.locator(".chat-turn")).toHaveCount(2);
    await expect(page.locator(".chat-working")).toHaveCount(0);
    expect(requests.at(-1)!.turns).toEqual([
      "我想找一个开源画图工具",
      "最好可以离线",
    ]);
  }
  const count = requests.length;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "你想用开源，做点什么？" }),
  ).toBeVisible();
  await expect(page.locator(".chat-turn")).toHaveCount(0);
  expect(requests).toHaveLength(count);
});
