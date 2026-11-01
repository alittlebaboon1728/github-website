import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CircleDot,
  GitBranch,
  GitFork,
  GitPullRequest,
  Info,
  Pause,
  Play,
  RefreshCw,
  Star,
  Tag,
} from "lucide-react";
import { contentRequest } from "../../observatoryApi";
import type { ActivityEvent } from "../../observatoryApi";
import PulseChart from "./PulseChart";
import "./pulse.css";

type PulseData = {
  events: (ActivityEvent & { actor?: string })[];
  bars: { at: string; count: number }[];
  scope: string;
  provider: string;
  fetchedAt: string;
  stale?: boolean;
};
export type GitHubPulseProps = {
  className?: string;
  endpoint?: string;
  /** Display cadence, independent of the one-minute data refresh. */
  tickMs?: number;
};
const icons = {
  "pull-request": GitPullRequest,
  push: GitBranch,
  issue: CircleDot,
  release: Tag,
  star: Star,
  fork: GitFork,
};
const clock = (at: string) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const fullDate = (at: string) =>
  new Date(at).toLocaleString("zh-CN", { hour12: false });

/** A movable, self-contained window into recent public GitHub activity. */
export default function GitHubPulse({
  className = "",
  endpoint = "/pulse",
  tickMs = 1800,
}: GitHubPulseProps) {
  const root = useRef<HTMLElement>(null);
  const [data, setData] = useState<PulseData | null>(null);
  const [incoming, setIncoming] = useState<PulseData | null>(null);
  const [cursor, setCursor] = useState(0);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [held, setHeld] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [foreground, setForeground] = useState(!document.hidden);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const stopped = paused || held || focused || !visible || !foreground;
  const stoppedRef = useRef(stopped);
  stoppedRef.current = stopped;

  useEffect(() => {
    const node = root.current;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (node) observer.observe(node);
    const onVisibility = () => setForeground(!document.hidden);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      if (media.matches) setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    media.addEventListener("change", onMotion);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", onMotion);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load(manual = false) {
      if (busy || (!manual && stoppedRef.current)) return;
      busy = true;
      setLoading(true);
      try {
        const response = await contentRequest<PulseData>(
          endpoint,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setIncoming(response.data);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load(true);
    const timer = setInterval(() => void load(), 75_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [endpoint, refresh]);

  // Hold an incoming batch while someone is interacting with a link.
  useEffect(() => {
    if (incoming && (!data || (!held && !focused))) {
      setData(incoming);
      setIncoming(null);
      setCursor(0);
    }
  }, [incoming, held, focused, data]);
  useEffect(() => {
    if (stopped || (data?.events.length || 0) <= 6) return;
    const timer = setInterval(
      () => setCursor((value) => value + 1),
      Math.max(800, tickMs),
    );
    return () => clearInterval(timer);
  }, [stopped, data, tickMs]);

  const events = data?.events || [];
  const length = Math.min(events.length, 6);
  // Replay each real sample in chronological order, with the latest entry on top.
  const rows = Array.from(
    { length },
    (_, index) =>
      events[
        (events.length -
          length -
          (cursor % events.length) +
          index +
          events.length) %
          events.length
      ],
  );
  const bars = data?.bars || [];
  return (
    <section
      ref={root}
      className={`gh-pulse ${className}`}
      aria-label="GitHub 近期动态"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={(event) =>
        setFocused(
          Boolean(
            (event.target as HTMLElement).closest(
              "a, details, [data-pulse-chart]",
            ),
          ),
        )
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <PulseChart bars={bars} stopped={stopped} loading={loading} />
      <header className="gh-pulse-heading">
        <h2>
          GitHub 现在发生了什么
          <span className="gh-pulse-mark" aria-hidden="true">
            ↗
          </span>
        </h2>
        <div className="gh-pulse-controls">
          <button
            className="bare-control"
            type="button"
            aria-label={paused ? "播放动态" : "暂停动态"}
            aria-pressed={paused}
            title={paused ? "播放动态" : "暂停动态"}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <Play aria-hidden="true" size={16} />
            ) : (
              <Pause aria-hidden="true" size={16} />
            )}
          </button>
          <button
            className="bare-control"
            type="button"
            aria-label="刷新近期动态"
            title="刷新"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw
              aria-hidden="true"
              size={16}
              className={loading ? "gh-pulse-refreshing" : ""}
            />
          </button>
        </div>
      </header>
      <div className="gh-pulse-window" aria-live="off">
        {events.length > 0 ? (
          <div
            key={`${data?.fetchedAt}-${cursor}`}
            className={`gh-pulse-rows ${cursor ? "gh-pulse-enter" : ""}`}
            style={{ animationPlayState: stopped ? "paused" : "running" }}
          >
            {rows.map((event) => {
              const Icon = icons[event.type as keyof typeof icons] || GitBranch;
              return (
                <a
                  key={event.id}
                  className="gh-pulse-event"
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${event.actor ? `${event.actor} · ` : ""}${event.repo} · ${event.text} · ${fullDate(event.occurredAt)}`}
                >
                  <Icon
                    aria-hidden="true"
                    size={14}
                    className={`gh-pulse-icon gh-pulse-icon-${event.type}`}
                  />
                  <span className="gh-pulse-message">
                    <strong>{event.repo}</strong>
                    <span>{event.text}</span>
                  </span>
                  <time dateTime={event.occurredAt}>
                    {clock(event.occurredAt)}
                  </time>
                  <ArrowUpRight
                    aria-hidden="true"
                    size={12}
                    className="gh-pulse-out"
                  />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="gh-pulse-empty" role="status">
            {loading
              ? "正在接收动态…"
              : error
                ? "动态暂不可用，点击刷新重试"
                : "暂时没有新动态"}
          </div>
        )}
      </div>
      <footer className="gh-pulse-footer">
        <span>
          {error || data?.stale ? "缓存回放" : paused ? "已暂停" : "近期动态"}
          <span className="gh-pulse-separator">·</span>
          {data?.provider || "GitHub"}
        </span>
        <details className="gh-pulse-info">
          <summary aria-label="数据来源说明" title="数据来源">
            <Info aria-hidden="true" size={12} />
          </summary>
          <div>
            {data?.scope || "近期公开活动，数据可能有延迟。"}
            {data?.fetchedAt && <small>抓取：{fullDate(data.fetchedAt)}</small>}
          </div>
        </details>
      </footer>
    </section>
  );
}
