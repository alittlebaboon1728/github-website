import { useEffect } from "react";
import { trialRequest, trialResourceKey } from "./trials";
import type { TrialCatalog, TrialStatus } from "./trials";
import { loadResource, useResource } from "./resourceCache";

export function preloadTrial(repo?: string) {
  return loadResource(
    trialResourceKey(repo),
    (signal) => trialRequest<TrialCatalog | TrialStatus>(repo, signal),
    { ttl: 15_000, speculative: true },
  );
}
function useTrialResource<T extends TrialCatalog | TrialStatus>(repo?: string) {
  const state = useResource<T>(
    trialResourceKey(repo),
    (signal) => trialRequest<T>(repo, signal),
    15_000,
  );
  const value = state.value;
  const running =
    value &&
    ("jobs" in value
      ? value.jobs.some((job) => job.state === "running")
      : value.job?.state === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(state.retry, repo ? 1800 : 2500);
    return () => clearTimeout(timer);
  }, [running, state.updatedAt, repo, state.error]);
  return {
    value: value || null,
    error: state.error instanceof Error ? state.error.message : "",
    retry: state.retry,
  };
}

/** Homepage and library read the same snapshot on their very first render. */
export default function useTrialCatalog() {
  const { value: catalog, ...rest } = useTrialResource<TrialCatalog>();
  return { catalog, ...rest };
}
export function useTrialStatus(repo: string) {
  const { value: status, ...rest } = useTrialResource<TrialStatus>(repo);
  return { status, ...rest };
}
