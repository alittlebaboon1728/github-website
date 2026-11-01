import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

type Bar = { at: string; count: number };
type Selection = { bar: Bar; x: number; index: number; below: boolean };
const clock = (at: string) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

/** The duplicated strip loops the same real sample; fresh batches morph in place. */
export default function PulseChart({
  bars,
  stopped,
  loading,
}: {
  bars: Bar[];
  stopped: boolean;
  loading: boolean;
}) {
  const chart = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const hasBars = bars.length > 0;
  const peak = Math.max(1, ...bars.map((bar) => bar.count));
  const total = bars.reduce((sum, bar) => sum + bar.count, 0);

  useEffect(() => {
    if (!hasBars) {
      setReady(false);
      return;
    }
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [hasBars]);
  useEffect(() => setSelection(null), [bars]);

  function select(element: HTMLElement) {
    if (!chart.current || !bars.length) return;
    const index = Number(element.dataset.barIndex);
    const bounds = chart.current.getBoundingClientRect();
    const slot = element.getBoundingClientRect();
    const x = Math.max(
      88,
      Math.min(bounds.width - 88, slot.left - bounds.left + slot.width / 2),
    );
    setSelection({
      bar: bars[index % bars.length],
      x,
      index,
      below: bounds.top < 110,
    });
  }
  function visibleSlots() {
    const bounds = chart.current?.getBoundingClientRect();
    return bounds
      ? Array.from(
          chart.current!.querySelectorAll<HTMLElement>("[data-bar-index]"),
        ).filter((element) => {
          const slot = element.getBoundingClientRect();
          const center = slot.left + slot.width / 2;
          return center >= bounds.left && center <= bounds.right;
        })
      : [];
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setSelection(null);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const slots = visibleSlots();
    const current = slots.findIndex(
      (slot) => Number(slot.dataset.barIndex) === selection?.index,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? slots.length - 1
          : Math.max(
              0,
              Math.min(
                slots.length - 1,
                current + (event.key === "ArrowLeft" ? -1 : 1),
              ),
            );
    if (slots[next]) select(slots[next]);
  }

  return (
    <>
      <div className="gh-pulse-chart-meta">
        <span>
          公开活动 <span className="gh-pulse-unit">/ 5 秒</span>
        </span>
        <span>
          {hasBars ? (
            <>
              <strong>{total.toLocaleString()}</strong>{" "}
              <span className="gh-pulse-unit">次 / 当前窗口</span>
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div
        ref={chart}
        className="gh-pulse-chart"
        data-pulse-chart=""
        role="group"
        tabIndex={hasBars ? 0 : undefined}
        aria-label={
          hasBars
            ? `公开活动柱图：${bars.length} 个时间段，共 ${total} 次事件（样本）；左右方向键查看详情`
            : "公开活动柱图暂无数据"
        }
        aria-describedby={selection ? tooltipId : undefined}
        onKeyDown={keyboard}
        onFocus={() => {
          setHasFocus(true);
          const first = visibleSlots()[0];
          if (first) select(first);
        }}
        onBlur={() => {
          setHasFocus(false);
          setSelection(null);
        }}
        onMouseLeave={() => {
          if (!hasFocus) setSelection(null);
        }}
      >
        <div className="gh-pulse-grid" aria-hidden="true">
          <span>{hasBars ? peak : ""}</span>
          <span>{hasBars ? Math.round(peak / 2) : ""}</span>
          <span>0</span>
        </div>
        <div className="gh-pulse-plot">
          <div
            className="gh-pulse-bars"
            aria-hidden="true"
            style={
              {
                "--pulse-columns": Math.max(1, bars.length) * 2,
                animationDuration: `${Math.max(1, bars.length) * 5}s`,
                animationPlayState:
                  stopped || hasFocus || !ready || bars.length < 2
                    ? "paused"
                    : "running",
              } as CSSProperties
            }
          >
            {[...bars, ...bars].map((bar, index) => (
              <div
                key={index}
                data-bar-index={index}
                className={`gh-pulse-bar-slot${selection?.index === index ? " gh-pulse-bar-selected" : ""}`}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch")
                    select(event.currentTarget);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  chart.current?.focus({ preventScroll: true });
                  select(event.currentTarget);
                }}
              >
                <div
                  className="gh-pulse-bar"
                  style={{
                    transform: `scaleY(${ready ? bar.count / peak : 0})`,
                    transitionDelay: `${(index % bars.length) * 22}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        {selection && (
          <div
            id={tooltipId}
            role="tooltip"
            className={`gh-pulse-chart-tooltip${selection.below ? " gh-pulse-chart-tooltip-below" : ""}`}
            style={{ left: selection.x }}
          >
            <time dateTime={selection.bar.at}>
              {new Date(selection.bar.at).toLocaleDateString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
              })}{" "}
              · {clock(selection.bar.at)}
            </time>
            <div>
              <span className="gh-pulse-tooltip-dot" />
              <span>公开活动</span>
              <strong>
                {selection.bar.count.toLocaleString()}
                <small> 次</small>
              </strong>
            </div>
            <small>5 秒采样</small>
          </div>
        )}
        {!hasBars && (
          <span className="gh-pulse-chart-empty">
            {loading ? "" : "暂无统计"}
          </span>
        )}
      </div>
      <div className="gh-pulse-axis" aria-hidden="true">
        <span>{hasBars ? clock(bars[0].at) : ""}</span>
        <span>{hasBars ? clock(bars[bars.length - 1].at) : ""}</span>
      </div>
    </>
  );
}
