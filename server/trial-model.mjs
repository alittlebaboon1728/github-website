import { readFileSync } from "node:fs";
import { GitHubError } from "./github.mjs";
import { boundedText } from "./storage.mjs";

export function createTrialModel(config = process.env, fetchImpl = fetch) {
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
    async json(instructions, input) {
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
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(180_000),
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
          }),
        });
      } catch {
        throw new GitHubError("试用生成连接中断或超时，可以稍后重试。", 502);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new GitHubError(
          response.status === 429
            ? "试用模型正在限流，请稍后重试。"
            : `试用模型请求失败（HTTP ${response.status}），请检查模型与接口配置。`,
          response.status === 429 ? 429 : 502,
        );
      }
      try {
        const result = JSON.parse(await boundedText(response, 800_000));
        const content = result.choices?.[0]?.message?.content;
        if (
          typeof content !== "string" ||
          result.choices[0].finish_reason === "length"
        )
          throw new Error();
        return JSON.parse(
          content
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, ""),
        );
      } catch {
        throw new GitHubError("模型返回的试用内容不完整，请重新生成。", 502);
      }
    },
  };
}
