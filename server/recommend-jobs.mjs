import { GitHubError } from "./github.mjs";
import { conversationKey } from "./recommend.mjs";

// All subscribers share computation and progress. Closing one tab does not stop
// another tab's request; closing the last one cancels queued/provider model work.
export function createRecommendationJobs(run) {
  const pending = new Map(),
    cache = new Map();
  return function subscribe(body, emit) {
    const key = conversationKey(body),
      saved = cache.get(key);
    if (saved && Date.now() - saved.at < 600_000)
      return {
        promise: Promise.resolve({ ...saved.result, source: "cache" }),
        release() {},
      };
    let job = pending.get(key);
    if (!job) {
      if (pending.size >= 2)
        throw new GitHubError("模型检索正忙，请稍后重试。", 429);
      const controller = new AbortController();
      job = { controller, listeners: new Set(), latest: new Map() };
      const current = job;
      pending.set(key, current);
      current.promise = Promise.resolve()
        .then(() =>
          run(body, {
            signal: controller.signal,
            emit: (event) => {
              if (controller.signal.aborted) return;
              current.latest.set(event.type, event);
              for (const listener of current.listeners) listener(event);
            },
          }),
        )
        .then((result) => {
          controller.signal.throwIfAborted();
          if (cache.size >= 160) cache.delete(cache.keys().next().value);
          cache.set(key, { at: Date.now(), result });
          return result;
        })
        .finally(() => {
          if (pending.get(key) === current) pending.delete(key);
        });
    }
    job.listeners.add(emit);
    for (const event of job.latest.values()) emit(event);
    return {
      promise: job.promise,
      release() {
        job.listeners.delete(emit);
        if (!job.listeners.size && pending.get(key) === job) {
          pending.delete(key);
          job.controller.abort();
        }
      },
    };
  };
}
