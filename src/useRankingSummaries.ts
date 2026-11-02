import { useEffect, useState } from "react";
import type { GeneratedCard } from "./generatedCards";
import { requestCardJob } from "./useGeneratedCards";
import type { CardJob } from "./useGeneratedCards";

type State = {
  key: string;
  job?: CardJob;
  cards: Record<string, GeneratedCard>;
  errors: Record<string, string>;
  error: string;
  busy: boolean;
};
const cache = new Map<string, State>();
const noCards: Record<string, GeneratedCard> = {};
const empty = (key: string): State => ({
  key,
  cards: {},
  errors: {},
  error: "",
  busy: true,
});

/** Summarize the displayed ranking, without replacing its order or live statistics. */
export function useRankingSummaries(names: string[], filters: string, initialCards = noCards, serverManaged = false) {
  const key = JSON.stringify([filters, names]);
  const [state, setState] = useState<State>(() => cache.get(key) || empty(key));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const [scope, repositories] = JSON.parse(key) as [string, string[]];
    if (serverManaged || repositories.every((name) => initialCards[name])) return;
    if (!repositories.length) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let current = cache.get(key) || empty(key);
    const commit = (next: State) => {
      if (controller.signal.aborted) return;
      current = next;
      cache.set(key, next);
      if (cache.size > 24) cache.delete(cache.keys().next().value!);
      setState(next);
    };
    const accept = (job: CardJob) =>
      commit({
        ...current,
        job,
        cards: {
          ...current.cards,
          ...Object.assign({}, ...job.pages.map((p) => p.cards)),
        },
        errors: Object.assign({}, ...job.pages.map((p) => p.errors)),
        busy: job.state === "running",
        error: "",
      });
    const failed = (error: unknown) =>
      commit({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : "中文总结暂时不可用。",
      });
    const poll = async (id: string) => {
      try {
        const job = await requestCardJob(`jobs/${id}`, controller.signal);
        accept(job);
        if (!controller.signal.aborted && job.state === "running")
          timer = setTimeout(() => void poll(id), 600);
      } catch (error) {
        failed(error);
      }
    };
    const begin = async () => {
      if (!attempt && current.job) {
        commit(current);
        if (current.job.state === "running") void poll(current.job.id);
        return;
      }
      commit({ ...current, busy: true, error: "", errors: {} });
      try {
        const job = await requestCardJob("ranking", controller.signal, {
          ...Object.fromEntries(new URLSearchParams(scope)),
          repositories,
        });
        accept(job);
        if (!controller.signal.aborted && job.state === "running")
          timer = setTimeout(() => void poll(job.id), 100);
      } catch (error) {
        failed(error);
      }
    };
    void begin();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, attempt, initialCards, serverManaged]);
  const current = state.key === key ? state : cache.get(key) || empty(key);
  // A larger visible batch can immediately reuse summaries from an earlier batch.
  const cards = Object.assign(
    {},
    ...[...cache.values()].map((s) => s.cards),
    current.cards,
    initialCards,
  ) as Record<string, GeneratedCard>;
  return {
    cards,
    busy: !serverManaged && names.some((name) => !cards[name]) && current.busy,
    ready: names.filter((name) => cards[name]).length,
    error: serverManaged ? "" : current.error,
    errors: serverManaged ? {} : current.errors,
    retry: () => setAttempt((value) => value + 1),
  };
}
