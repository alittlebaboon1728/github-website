import test from "node:test";
import assert from "node:assert/strict";
import { createTrialModel } from "../server/trial-model.mjs";

const config = {
  TRIAL_AI_BASE_URL: "https://provider.test/v1",
  TRIAL_AI_API_KEY: "test-secret",
  TRIAL_AI_MODEL: "gpt-6.1-sol",
};
const chunk = (content, finish_reason = null) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\n\n`;
function stream(text, split = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        if (split)
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const success = () =>
  stream(chunk('{"说明":"中文内容"}') + chunk("", "stop") + "data: [DONE]\n\n");

test("trial streaming handles split UTF-8, heartbeats and CRLF; only content deltas become the final JSON", async () => {
  let sent,
    firstContent = 0;
  const model = createTrialModel(config, async (_url, options) => {
    sent = JSON.parse(options.body);
    return stream(
      ": heartbeat\r\n\r\n" +
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "PRIVATE_REASONING", role: "assistant" } }] })}\r\n\r\n` +
        chunk('{"说明":"中') +
        chunk('文内容"}', "stop") +
        "data: [DONE]\n\n",
      true,
    );
  });
  assert.deepEqual(
    await model.json(
      "current project",
      { readme: "only current source" },
      { onContent: () => firstContent++ },
    ),
    { 说明: "中文内容" },
  );
  assert.equal(sent.stream, true);
  assert.equal(firstContent, 1);
  assert.deepEqual(
    sent.messages.map((message) => message.role),
    ["system", "user"],
  );
});

test("temporary 502 retries with backoff and exposes progress without leaking upstream error bodies", async () => {
  const waits = [],
    retries = [];
  let calls = 0;
  const model = createTrialModel(
    config,
    async () =>
      ++calls < 3
        ? Response.json({ error: { message: "test-secret" } }, { status: 502 })
        : success(),
    { wait: async (ms) => waits.push(ms) },
  );
  assert.deepEqual(
    await model.json("", {}, { onRetry: (count) => retries.push(count) }),
    { 说明: "中文内容" },
  );
  assert.deepEqual(waits, [1000, 2000]);
  assert.deepEqual(retries, [1, 2]);
});

test("a cut stream retries from the original input without mixing partial output across attempts", async () => {
  const inputs = [];
  const signals = [];
  const model = createTrialModel(
    config,
    async (_url, options) => {
      inputs.push(JSON.parse(options.body));
      signals.push(options.signal);
      return inputs.length === 1
        ? stream(chunk('{"leaked":"unfinished'))
        : success();
    },
    { wait: async () => {} },
  );
  assert.deepEqual(await model.json("current project", { readme: "source" }), {
    说明: "中文内容",
  });
  assert.deepEqual(inputs[0], inputs[1]);
  assert.equal(signals[0], signals[1]); // retries share the original deadline
});

test("retries stop after three attempts, preserve HTTP status, and distinguish temporary outages from configuration", async () => {
  let calls = 0;
  const model = createTrialModel(
    config,
    async () => {
      calls++;
      return new Response("test-secret", { status: 502 });
    },
    { wait: async () => {} },
  );
  await assert.rejects(
    model.json("", {}),
    (error) =>
      error.status === 502 &&
      /暂时不可用/.test(error.message) &&
      !/检查模型|test-secret/.test(error.message),
  );
  assert.equal(calls, 3);
  let authCalls = 0;
  const auth = createTrialModel(config, async () => {
    authCalls++;
    return new Response("test-secret", { status: 401 });
  });
  await assert.rejects(
    auth.json("", {}),
    (error) => /401/.test(error.message) && !/test-secret/.test(error.message),
  );
  assert.equal(authCalls, 1);
});

test("provider Retry-After is respected, and a long cooldown fails without immediate repeated calls", async () => {
  const waits = [];
  let calls = 0;
  const model = createTrialModel(
    config,
    async () =>
      ++calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "3" } })
        : success(),
    { wait: async (ms) => waits.push(ms) },
  );
  await model.json("", {});
  assert.deepEqual(waits, [3000]);
  calls = 0;
  const blocked = createTrialModel(config, async () => {
    calls++;
    return new Response("", { status: 429, headers: { "retry-after": "60" } });
  });
  await assert.rejects(blocked.json("", {}), (error) => error.status === 429);
  assert.equal(calls, 1);
});

test("length-truncated content is rejected, and a non-streaming compatible response still works", async () => {
  let calls = 0;
  const truncated = createTrialModel(config, async () => {
    calls++;
    return stream(chunk('{"说明":"中文"}', "length") + "data: [DONE]\n\n");
  });
  await assert.rejects(truncated.json("", {}), /内容不完整/);
  assert.equal(calls, 1);
  const compatible = createTrialModel(config, async () =>
    Response.json({
      choices: [
        {
          message: { content: '```json\n{"ok":true}\n```' },
          finish_reason: "stop",
        },
      ],
    }),
  );
  assert.deepEqual(await compatible.json("", {}), { ok: true });
});
