import { useEffect, useState } from "react";
import { normalizeRepo, ApiError } from "./api";
import type { ApiEnvelope, RawRepository } from "./api";
import type { GeneratedCard } from "./generatedCards";

type Page = {
  number: number;
  state:
    | "queued"
    | "searching"
    | "generating"
    | "ready"
    | "partial"
    | "error"
    | "skipped";
  items: RawRepository[];
  cards: Record<string, GeneratedCard>;
  errors: Record<string, string>;
  total: number;
  error?: string;
};
export type CardJob = {
  id: string;
  state: "running" | "ready" | "partial";
  pages: Page[];
};
type State = {
  key: string;
  pages: Page[];
  jobs: Record<string, CardJob>;
  busy: boolean;
  error: string;
  request: { page: number; count: number };
  attempt?: number;
};
const cache = new Map<string, State>();
const blank = (key: string): State => ({
  key,
  pages: [],
  jobs: {},
  busy: true,
  error: "",
  request: { page: 1, count: 3 },
});

export async function requestCardJob(
  path: string,
  signal: AbortSignal,
  body?: unknown,
) {
  const response = await fetch(`/api/observatory/cards/${path}`, {
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(
      value.error || "中文介绍准备失败，请重试。",
      response.status,
    );
  return (value as ApiEnvelope<CardJob>).data;
}

export function useGeneratedCards({
  query,
  sort,
  enabled,
  revision,
}: {
  query: string;
  sort: string;
  enabled: boolean;
  revision: number;
}) {
  const key = JSON.stringify([query, sort, revision]);
  const [state, setState] = useState<State>(() => cache.get(key) || blank(key));
  const [action, setAction] = useState<{
    key: string;
    page: number;
    count: number;
    attempt: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let current = cache.get(key) || blank(key);
    const explicit = action?.key === key ? action : null;
    const commit = (next: State) => {
      if (controller.signal.aborted) return;
      current = next;
      cache.set(key, next);
      if (cache.size > 12) cache.delete(cache.keys().next().value!);
      setState(next);
    };
    const accept = (job: CardJob) => {
      const pages = new Map(current.pages.map((page) => [page.number, page]));
      for (const page of job.pages) {
        const previous = pages.get(page.number);
        const preparing = ["queued", "searching", "generating"].includes(
          page.state,
        );
        pages.set(
          page.number,
          previous && preparing
            ? {
                ...page,
                items: page.items.length ? page.items : previous.items,
                cards: { ...previous.cards, ...page.cards },
              }
            : page,
        );
      }
      const failed = job.pages.find((page) => page.state === "error");
      const jobs = { ...current.jobs, [job.id]: job };
      commit({
        ...current,
        jobs,
        pages: [...pages.values()].sort((a, b) => a.number - b.number),
        busy: Object.values(jobs).some((job) => job.state === "running"),
        error: failed?.error || "",
      });
    };
    const poll = async (id: string) => {
      try {
        const job = await requestCardJob(`jobs/${id}`, controller.signal);
        accept(job);
        if (!controller.signal.aborted && job.state === "running")
          timers.set(
            id,
            setTimeout(() => void poll(id), 600),
          );
      } catch (error) {
        if (!controller.signal.aborted)
          commit({
            ...current,
            busy: false,
            error:
              error instanceof Error
                ? error.message
                : "生成状态读取失败，请重试。",
          });
      }
    };
    async function begin() {
      // Back navigation resumes an existing job instead of generating the first three pages again.
      if (
        (!explicit || explicit.attempt === current.attempt) &&
        Object.keys(current.jobs).length
      ) {
        commit(current);
        for (const job of Object.values(current.jobs))
          if (job.state === "running") void poll(job.id);
        return;
      }
      for (const job of Object.values(current.jobs))
        if (job.state === "running") void poll(job.id);
      const request = explicit || { page: 1, count: 3 };
      commit({
        ...current,
        busy: true,
        error: "",
        request,
        attempt: explicit?.attempt,
      });
      try {
        const job = await requestCardJob("pages", controller.signal, {
          q: query,
          sort,
          page: request.page,
          count: request.count,
        });
        accept(job);
        if (!controller.signal.aborted && job.state === "running")
          timers.set(
            job.id,
            setTimeout(() => void poll(job.id), 100),
          );
      } catch (error) {
        if (!controller.signal.aborted)
          commit({
            ...current,
            busy: false,
            error:
              error instanceof Error
                ? error.message
                : "中文介绍准备失败，请重试。",
          });
      }
    }
    void begin();
    return () => {
      controller.abort();
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [key, enabled, action, query, sort]);
  const current = state.key === key ? state : cache.get(key) || blank(key);
  const pages = current.pages.filter((page) => page.state !== "skipped");
  const repositories = [
    ...new Map(
      pages.flatMap((page) =>
        page.items.map(
          (repo) =>
            [
              repo.full_name,
              { ...normalizeRepo(repo), generated: page.cards[repo.full_name] },
            ] as const,
        ),
      ),
    ).values(),
  ];
  const errors = Object.assign(
    {},
    ...pages.map((page) => page.errors),
  ) as Record<string, string>;
  const ready = repositories.filter((repo) => repo.generated).length;
  const last = pages
    .filter(
      (page) =>
        page.items.length ||
        page.state === "error" ||
        page.state === "ready" ||
        page.state === "partial",
    )
    .at(-1);
  const workingPage = pages.find((page) =>
    ["searching", "generating"].includes(page.state),
  );
  const failedPage = pages.find(
    (page) => page.state === "error" || page.state === "partial",
  );
  const hasMore = Boolean(
    last &&
    !pages.some((page) =>
      ["queued", "searching", "error"].includes(page.state),
    ) &&
    !(action?.key === key && action.page > last.number) &&
    last.items.length &&
    last.number < 84 &&
    last.number * 12 < Math.min(last.total, 1000),
  );
  const generate = (page: number, count = 1) =>
    setAction((previous) => ({
      key,
      page,
      count,
      attempt: (previous?.attempt || 0) + 1,
    }));
  return {
    enabled,
    repositories,
    errors,
    ready,
    busy: enabled && current.busy,
    error: current.error,
    hasMore,
    total: last?.total,
    lastPage: workingPage?.number || last?.number || 0,
    message: current.busy
      ? `正在准备中文项目卡 · ${ready} / ${repositories.length || "…"}${pages.some((page) => page.state === "queued") ? " · 前三页" : ""}`
      : failedPage
        ? `已准备 ${ready} 项 · 部分介绍待重试`
        : `中文项目卡已准备 · ${ready} 项`,
    loadMore: () => generate((last?.number || 3) + 1),
    retry: () =>
      generate(
        failedPage?.number || current.request.page,
        failedPage ? 1 : current.request.count,
      ),
    needsRetry: Boolean(failedPage || current.error),
  };
}
