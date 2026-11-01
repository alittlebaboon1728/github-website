import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FlaskConical, Loader2 } from "lucide-react";
import { trialPath, trialRequest } from "../trials";
import type { TrialStatus } from "../trials";
import GlassButton from "./GlassButton";

export default function TrialLaunch({
  repo,
  onClose,
}: {
  repo: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    repo: string;
    value?: TrialStatus;
    error?: string;
    busy?: boolean;
  }>({ repo });
  const active = useRef<AbortController | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setState({ repo });
    trialRequest<TrialStatus>(repo, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setState((previous) => ({ ...previous, repo, value }));
      })
      .catch(() => {
        /* An explicit click can retry a temporarily unavailable service. */
      });
    return () => controller.abort();
  }, [repo]);
  const current = state.repo === repo ? state : { repo };
  const exists = Boolean(current.value?.trial),
    running = current.value?.job?.state === "running";
  async function open() {
    if (pending.current) return;
    if (!exists && !running) {
      setState({ ...current, busy: true, error: undefined });
      pending.current = true;
      const controller = active.current!;
      try {
        await trialRequest<TrialStatus>(repo, controller.signal, {});
      } catch (error) {
        pending.current = false;
        if (!controller.signal.aborted)
          setState({
            ...current,
            busy: false,
            error:
              error instanceof Error ? error.message : "生成请求失败，请重试。",
          });
        return;
      }
      if (controller.signal.aborted) return;
    }
    onClose();
    window.location.hash = trialPath(repo);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return (
    <div className="quick-trial-launch">
      <div>
        <FlaskConical size={19} aria-hidden="true" />
        <span>
          <strong>
            {exists
              ? "试用已准备好"
              : running
                ? "项目试用正在生成"
                : "把项目变成一次上手体验"}
          </strong>
          <small>
            {exists
              ? "打开使用说明，动手完成一个小任务"
              : "AI 根据项目资料整理说明，设计适合它的体验"}
          </small>
        </span>
      </div>
      <GlassButton onClick={() => void open()} disabled={current.busy}>
        {current.busy ? (
          <Loader2 size={15} className="spin" />
        ) : (
          <FlaskConical size={15} />
        )}
        {current.busy
          ? "正在提交…"
          : exists
            ? "打开项目试用"
            : running
              ? "查看生成进度"
              : "生成项目试用"}
        <ArrowUpRight size={14} />
      </GlassButton>
      {current.error && <p role="alert">{current.error}</p>}
    </div>
  );
}
