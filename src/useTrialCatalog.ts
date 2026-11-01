import { useEffect, useState } from "react";
import { trialRequest } from "./trials";
import type { TrialCatalog } from "./trials";

/** Shared read-only catalog for the library and homepage feature. */
export default function useTrialCatalog() {
  const [catalog, setCatalog] = useState<TrialCatalog | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const value = await trialRequest<TrialCatalog>(
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setCatalog(value);
        setError("");
        if (value.jobs.some((job) => job.state === "running"))
          timer = setTimeout(() => void read(), 2500);
      } catch (problem) {
        if (!controller.signal.aborted)
          setError(
            problem instanceof Error
              ? problem.message
              : "暂时无法读取已生成的试用。",
          );
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision]);
  return { catalog, error, retry: () => setRevision((value) => value + 1) };
}
