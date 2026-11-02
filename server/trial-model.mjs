import { readFileSync } from "node:fs";
import { GitHubError } from "./github.mjs";
import { boundedText } from "./storage.mjs";
import { setTimeout as delay } from "node:timers/promises";

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const incomplete = () =>
  new GitHubError("模型返回的试用内容不完整，请重新生成。", 502);
function interrupted() {
  const error = new GitHubError("试用生成连接中断或超时，可以稍后重试。", 502);
  error.retryable = true;
  return error;
}

async function completionContent(response, onContent) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const result = JSON.parse(await boundedText(response, 800_000));
    const choice = result.choices?.[0];
    if (choice?.finish_reason === "length") throw incomplete();
    return choice?.message?.content;
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    data = [],
    content = "",
    bytes = 0,
    finish,
    doneEvent = false;
  function dispatch() {
    if (!data.length) return;
    const payload = data.join("\n");
    data = [];
    if (payload === "[DONE]") {
      doneEvent = true;
      return;
    }
    const event = JSON.parse(payload);
    if (event.error) throw interrupted();
    const choice = event.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (typeof choice?.delta?.content === "string" && choice.delta.content) {
      if (!content) onContent?.();
      content += choice.delta.content;
      if (content.length > 800_000) throw incomplete();
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      bytes += value?.byteLength || 0;
      if (bytes > 4_000_000) throw incomplete();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      if (done && pending) {
        lines.push(pending);
        pending = "";
      }
      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (!line) dispatch();
        else if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (done) {
        dispatch();
        break;
      }
      if (doneEvent) break;
    }
    if (finish === "length") throw incomplete();
    // A partial JSON object must never be accepted as a completed trial.
    if (!doneEvent && finish !== "stop") throw interrupted();
    return content;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createTrialModel(
  config = process.env,
  fetchImpl = fetch,
  { wait = (ms) => delay(ms), timeoutMs = 180_000 } = {},
) {
  let key = config.TRIAL_AI_API_KEY;
  if (!key) {
    try {
      const line = readFileSync("api.txt", "utf8")
        .split(/\r?\n/)
        .find((value) => /^gpt\s*[:：]/i.test(value.trim()));
      key = line?.match(/sk-[A-Za-z0-9_-]+/)?.[0];
    } catch {
      /* Deployment can use environment variables only. */
    }
  }
  const base = config.TRIAL_AI_BASE_URL || "https://api.openai.com/v1";
  const name = config.TRIAL_AI_MODEL || "gpt-6.1-sol";
  return {
    configured: Boolean(key),
    name,
    async json(instructions, input, { onRetry, onContent } = {}) {
      if (!key)
        throw new GitHubError("项目试用生成尚未配置，请联系站点维护者。", 503);
      let endpoint;
      try {
        endpoint = new URL(`${base.replace(/\/$/, "")}/chat/completions`);
        if (
          endpoint.protocol !== "https:" &&
          !["127.0.0.1", "localhost"].includes(endpoint.hostname)
        )
          throw new Error();
      } catch {
        throw new GitHubError("试用模型的服务地址配置无效。", 503);
      }
      const deadline = AbortSignal.timeout(timeoutMs);
      for (let attempt = 0; attempt < 3; attempt++) {
        let retryAfter = 0;
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            redirect: "error",
            signal: deadline,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: name,
              messages: [
                { role: "system", content: instructions },
                { role: "user", content: JSON.stringify(input) },
              ],
              response_format: { type: "json_object" },
              max_tokens: 16000,
              stream: true,
            }),
          });
          if (!response.ok) {
            const retryHeader = response.headers.get("retry-after");
            retryAfter = /^\d+(?:\.\d+)?$/.test(retryHeader || "")
              ? Number(retryHeader) * 1000
              : Math.max(0, Date.parse(retryHeader) - Date.now()) || 0;
            await response.body?.cancel();
            const transient = retryableStatuses.has(response.status);
            const error = new GitHubError(
              response.status === 429
                ? "试用模型正在限流，请稍后重试。"
                : transient
                  ? `试用模型服务暂时不可用（HTTP ${response.status}），请稍后重试。`
                  : `试用模型请求失败（HTTP ${response.status}），请检查模型与接口配置。`,
              response.status === 429 ? 429 : 502,
            );
            error.retryable = transient && retryAfter <= 10_000;
            throw error;
          }
          const content = await completionContent(response, onContent);
          if (typeof content !== "string") throw incomplete();
          try {
            return JSON.parse(
              content
                .trim()
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```$/, ""),
            );
          } catch {
            throw incomplete();
          }
        } catch (cause) {
          const error = cause instanceof GitHubError ? cause : interrupted();
          if (!error.retryable || attempt === 2 || deadline.aborted)
            throw error;
          onRetry?.(attempt + 1);
          // All attempts share the original time budget. Waiting cannot extend it.
          let abortWait;
          try {
            await Promise.race([
              wait(Math.max(retryAfter, 1000 * 2 ** attempt)),
              new Promise((_, reject) => {
                abortWait = () => reject(interrupted());
                if (deadline.aborted) reject(interrupted());
                else
                  deadline.addEventListener("abort", abortWait, { once: true });
              }),
            ]);
          } finally {
            deadline.removeEventListener("abort", abortWait);
          }
        }
      }
    },
  };
}
