import { loadResource, useResource } from "./resourceCache";
import { ApiError } from "./api";
import type { ApiEnvelope, RawRepository } from "./api";
import type { GeneratedCard } from "./generatedCards";

export type ActivityEvent = {
  id: string;
  repo: string;
  type: string;
  text: string;
  url: string;
  occurredAt: string;
};
export type ActivityData = {
  events: ActivityEvent[];
  scope: string;
  fetchedAt: string;
  stale?: boolean;
  warning?: string;
};
export type TrendData = {
  cards?: Record<string, GeneratedCard>;
  prepared?: boolean;
  pending_count?: number;
  repositories: RawRepository[];
  query: string;
  scope: string;
  total: number;
  incomplete: boolean;
  persistence: boolean;
  persistenceReason: string | null;
  growth: {
    ready: boolean;
    days: number;
    coverage: string;
    from?: string;
    to?: string;
    startedAt?: string;
    items: {
      repo: RawRepository;
      delta: number;
      points: { at: string; stars: number }[];
    }[];
  };
};
export type Condition = { id: string; label: string; level: "must" | "prefer" };
export type Override = Omit<Condition, "level"> & {
  level: "must" | "prefer" | "remove";
};
export type Recommendation = {
  repo: RawRepository;
  purpose: string;
  reason: string;
  evidence: string;
  checks: (Condition & {
    status: "met" | "not-met" | "unknown";
    quote: string | null;
  })[];
  limitations: { text: string; unknown: boolean; quote: string | null }[];
  sourceUrl: string;
  source: string;
  fetchedAt: string;
};
export type RecommendationData = {
  partial?: boolean;
  answer?: {
    text: string;
    quotes: string[];
    repo: string;
    sourceUrl: string;
    fetchedAt: string;
    source: string;
  };
  plan: { summary: string; constraints: Condition[]; queries: string[] };
  selections: Recommendation[];
  warning?: string;
  searched: number;
  verified: number;
};
export type Conversation = {
  turns: string[];
  overrides: Override[];
  repo?: string;
};

export async function contentRequest<T>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  let response;
  try {
    response = await fetch(`/api/observatory${path}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("网络暂时不可用，请检查连接后重试。", 0);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("内容服务没有返回有效数据。", 502);
  }
  if (!response.ok)
    throw new ApiError(
      body.error || "内容暂时无法读取。",
      response.status,
      body.resetAt,
    );
  return body;
}

export function preloadContent(path: string) {
  return loadResource(
    `content:${path}`,
    (signal) => contentRequest(path, signal),
    { speculative: true },
  );
}
export function useContent<T>(path: string | null) {
  const state = useResource<ApiEnvelope<T>>(
    path ? `content:${path}` : null,
    (signal) => contentRequest<T>(path!, signal),
  );
  return {
    result: state.value || null,
    loading: state.loading,
    error: state.error as ApiError | null,
    retry: state.retry,
  };
}

export async function askProjects(
  body: Conversation,
  signal: AbortSignal,
  onProgress: (message: string) => void,
  onPartial?: (value: ApiEnvelope<RecommendationData>) => void,
): Promise<ApiEnvelope<RecommendationData>> {
  let response;
  try {
    response = await fetch("/api/observatory/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError("网络暂时不可用，请检查连接后重试。", 0);
  }
  if (!response.ok) {
    const data = await response.json();
    throw new ApiError(data.error || "AI 搜索暂时不可用。", response.status);
  }
  if (!response.body) throw new ApiError("模型服务没有返回内容。", 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      if (done && pending) {
        lines.push(pending);
        pending = "";
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "progress") onProgress(event.message);
        if (event.type === "partial") onPartial?.(event);
        if (event.type === "error") throw new ApiError(event.error, 502);
        if (event.type === "result") return event;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new ApiError("检索连接中断，请重试。", 502);
}

export function dateLabel(date: string | null | undefined, time = false) {
  if (!date || !Number.isFinite(Date.parse(date))) return "尚未成功更新";
  return new Date(date).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
export type SearchMode = "auto" | "github" | "ai";
export function usesAi(text: string, mode: SearchMode) {
  return (
    mode === "ai" ||
    (mode === "auto" &&
      ((/推荐|我想|有没有|适合|最好|需要|帮我|不想|能否|哪些|哪个/.test(text) &&
        text.length > 8) ||
        text.trim().split(/\s+/).length > 5))
  );
}
export function conversationPath(conversation: Conversation) {
  // HTTP LAN deployments lack randomUUID (secure-context only), but still
  // support getRandomValues. This opaque entry id isolates each new dialogue.
  const entry = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `/ask?${new URLSearchParams({ entry, turns: JSON.stringify(conversation.turns), overrides: JSON.stringify(conversation.overrides), ...(conversation.repo ? { repo: conversation.repo } : {}) })}`;
}
export function readConversation(search: string): Conversation {
  try {
    const params = new URLSearchParams(search);
    const turns = JSON.parse(params.get("turns") || "[]");
    const overrides = JSON.parse(params.get("overrides") || "[]");
    const repo = params.get("repo") || undefined;
    if (
      !Array.isArray(turns) ||
      turns.length > 8 ||
      turns.some((t) => typeof t !== "string" || !t.trim() || t.length > 500) ||
      !Array.isArray(overrides) ||
      (repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(repo))
    )
      throw new Error("invalid");
    return { turns, overrides, ...(repo ? { repo } : {}) };
  } catch {
    return { turns: [], overrides: [] };
  }
}
