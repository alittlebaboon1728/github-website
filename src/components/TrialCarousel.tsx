import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { trialPath } from "../trials";
import type { TrialSummary } from "../trials";
import TrialIllustration from "./TrialIllustration";
import { trialPresentation } from "../trialPresentation";
import { preloadTrialLink } from "../navigationPreload";

const nativeTrial: TrialSummary = {
  repo: "excalidraw/excalidraw",
  name: "Excalidraw",
  title: "把想法画成一张清楚的图",
  summary: "拖动图形、写下想法、连起关系，再把作品带走。",
  duration: "约 3 分钟",
  generatedAt: "",
  model: "",
  kind: "interactive",
};
const noTrials: TrialSummary[] = [];
export default function TrialCarousel({
  trials = noTrials,
}: {
  trials?: TrialSummary[];
}) {
  const items = useMemo(
    () => [
      nativeTrial,
      ...trials
        .filter((trial) => trial.repo.toLowerCase() !== nativeTrial.repo)
        .slice(0, 2),
    ],
    [trials],
  );
  const count = items.length;
  const loop = count > 1;
  const signature = items.map((item) => item.repo).join("|");
  const slides = loop ? [items[count - 1], ...items, items[0]] : items;
  const track = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null);
  const activeRef = useRef(0),
    settleTimer = useRef(0),
    selectedRepo = useRef(nativeTrial.repo);
  const [index, setIndex] = useState(0),
    [interaction, setInteraction] = useState(0);
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(false),
    [hidden, setHidden] = useState(document.hidden);
  const active = Math.min(index, count - 1);
  const playing =
    loop && !hovered && !focused && !dragging && !reduced && visible && !hidden;
  function go(next: number) {
    const node = track.current;
    if (!node?.isConnected || !node.clientWidth || !loop) return;
    const logical = (next + count) % count;
    const physical =
      activeRef.current === count - 1 && logical === 0
        ? count + 1
        : activeRef.current === 0 && next < 0
          ? 0
          : logical + 1;
    setInteraction((value) => value + 1);
    node.scrollTo({
      left: physical * node.clientWidth,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  useLayoutEffect(() => {
    const node = track.current;
    if (!node) return;
    const next = Math.max(
      0,
      items.findIndex((item) => item.repo === selectedRepo.current),
    );
    activeRef.current = next;
    setIndex(next);
    node.scrollTo({
      left: (loop ? next + 1 : 0) * node.clientWidth,
      behavior: "instant",
    });
    let width = node.clientWidth;
    const resize = new ResizeObserver(() => {
      if (!node.isConnected || !node.clientWidth) return;
      if (width === node.clientWidth) return;
      width = node.clientWidth;
      node.scrollTo({
        left: (loop ? activeRef.current + 1 : 0) * width,
        behavior: "instant",
      });
    });
    resize.observe(node);
    function settle() {
      if (!loop || !node?.isConnected || !node.clientWidth) return;
      const position = node.scrollLeft / node.clientWidth;
      if (Math.abs(position - Math.round(position)) > 0.01) return;
      // The extra end slide looks identical: normalize only after movement finishes.
      if (position < 0.5)
        node.scrollTo({ left: count * node.clientWidth, behavior: "instant" });
      else if (position > count + 0.5)
        node.scrollTo({ left: node.clientWidth, behavior: "instant" });
    }
    function onScroll() {
      // A queued scroll can arrive while a route is being removed or hidden.
      if (!node?.isConnected || !node.clientWidth) return;
      const position = Math.round(node!.scrollLeft / node!.clientWidth);
      const next = loop ? (((position - 1) % count) + count) % count : 0;
      activeRef.current = next;
      selectedRepo.current = items[next].repo;
      setIndex(next);
      clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 180);
    }
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("scrollend", settle);
    return () => {
      resize.disconnect();
      clearTimeout(settleTimer.current);
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("scrollend", settle);
    };
  }, [signature]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    const release = () => setDragging(false);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.intersectionRatio >= 0.4),
      { threshold: 0.4 },
    );
    if (root.current) observer.observe(root.current);
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => go(activeRef.current + 1), 6500);
    return () => clearTimeout(timer);
  }, [playing, active, interaction, count]);
  return (
    <section
      ref={root}
      className="trial-carousel"
      aria-label="精选项目试用"
      aria-roledescription="轮播"
      data-rotation={playing ? "playing" : "paused"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) =>
        setFocused(event.target.matches(":focus-visible"))
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div
        className="trial-carousel-track"
        ref={track}
        tabIndex={0}
        aria-label="项目试用横幅，左右方向键切换"
        onPointerDown={() => {
          setDragging(true);
          setInteraction((value) => value + 1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            go(activeRef.current + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      >
        {slides.map((trial, position) => {
          const story = trialPresentation(trial);
          const logical = loop ? (position - 1 + count) % count : 0;
          const clone = loop && (position === 0 || position === count + 1);
          return (
            <div
              className="trial-carousel-slide"
              key={`${position}-${trial.repo}`}
              role="group"
              aria-roledescription="幻灯片"
              aria-label={`${logical + 1} / ${count}：${trial.name}`}
              aria-hidden={clone || logical !== active}
              inert={clone || logical !== active}
              data-clone={clone || undefined}
            >
              <a
                className="trial-feature"
                onPointerEnter={() => preloadTrialLink(trial.repo)}
                onFocus={() => preloadTrialLink(trial.repo)}
                onTouchStart={() => preloadTrialLink(trial.repo)}
                href={
                  trial.repo === nativeTrial.repo
                    ? "#/project/excalidraw/excalidraw"
                    : trialPath(trial.repo)
                }
              >
                <div className="trial-feature-copy">
                  <span className="trial-kind">{story.format}</span>
                  <h2>{trial.name}</h2>
                  <p className="trial-feature-description">
                    {story.title
                      .match(/[^，？。]+[，？。]?/g)
                      ?.map((clause, i) => (
                        <span key={i}>{clause}</span>
                      ))}
                  </p>
                  <p>{trial.summary}</p>
                  <div className="trial-feature-tags">
                    <span>
                      <Clock3 size={14} />
                      {trial.duration}
                    </span>
                  </div>
                  <span className="trial-feature-action">
                    {trial.repo === nativeTrial.repo
                      ? "打开白板试用"
                      : "查看项目试用"}
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <div className="trial-feature-canvas">
                  <TrialIllustration trial={trial} />
                </div>
              </a>
            </div>
          );
        })}
      </div>
      {loop && (
        <div
          className="trial-carousel-dots"
          role="group"
          aria-label="选择试用项目"
        >
          {items.map((trial, i) => (
            <button
              key={trial.repo}
              className="trial-carousel-dot"
              aria-label={`查看 ${trial.name} 试用横幅`}
              aria-pressed={active === i}
              onClick={() => go(i)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
