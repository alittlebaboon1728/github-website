import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import Sketch from "./Sketch";

const chapters = [
  {
    start: 0,
    end: 12,
    title: "从一个想法开始",
    caption: "想法太多，讲不清楚？先给它们一张自由的白板。",
    label: "灵感，有了落脚的地方。",
  },
  {
    start: 12,
    end: 28,
    title: "把逻辑画出来",
    caption: "用矩形、箭头和文字，把“我想的是这样”变成“原来是这样”。",
    label: "一张草图，胜过三分钟的解释。",
  },
  {
    start: 28,
    end: 43,
    title: "让大家看见同一个想法",
    caption:
      "在官网应用中，可以通过房间链接一起协作；这里展示的是协作场景示意。",
    label: "不同的人，终于看向同一个方向。",
  },
  {
    start: 43,
    end: 60,
    title: "带着作品，继续前进",
    caption:
      "画好的图可以导出成 PNG、SVG，或保存成可继续编辑的 .excalidraw 文件。",
    label: "让好想法，不只留在脑海里。",
  },
];
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export default function StoryPlayer({ onTry }: { onTry: () => void }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const player = useRef<HTMLElement>(null);
  const index = chapters.findIndex((c) => time >= c.start && time < c.end);
  const active = index < 0 ? 3 : index;
  const chapter = chapters[active];
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = (now - previous) / 1000;
      previous = now;
      if (!document.hidden) setTime((value) => Math.min(60, value + delta));
    }, 200);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (time >= 60) setPlaying(false);
  }, [time]);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = player.current?.querySelector<HTMLElement>("button");
    first?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = Array.from(
        player.current?.querySelectorAll<HTMLElement>("button,input") || [],
      ).filter((el) => el.getClientRects().length);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0].focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [fullscreen]);
  useEffect(() => {
    if (!fullscreen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", key);
    };
  }, [fullscreen]);
  function toggle() {
    if (time >= 60) setTime(0);
    setPlaying((value) => !value);
  }
  return (
    <section
      ref={player}
      role={fullscreen ? "dialog" : "region"}
      aria-modal={fullscreen || undefined}
      className={`story-player ${fullscreen ? "player-expanded" : ""}`}
      aria-label="Excalidraw 动态项目讲解"
    >
      <div className="player-titlebar">
        <span>
          <span className="small-asterisk">✳</span>一分钟，看懂一个好项目
        </span>
        <span>动态图解 · 4 个章节</span>
        <button
          className="icon-btn"
          aria-label={fullscreen ? "退出放大讲解" : "放大讲解"}
          onClick={() => setFullscreen((value) => !value)}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div className="player-canvas">
        <div className="player-chapter-label">
          <span>{String(active + 1).padStart(2, "0")}</span>
          {chapter.title}
        </div>
        <Sketch key={active} scene={active} />
        {!playing && time === 0 && (
          <button
            className="big-play"
            aria-label="播放项目讲解"
            onClick={toggle}
          >
            <Play size={24} fill="currentColor" />
            <span>60 秒，看见它的可能</span>
          </button>
        )}
        <div className="scene-bottom-label">{chapter.label}</div>
        {active === 2 && <span className="simulation-note">协作场景示意</span>}
        {active === 3 && (
          <button
            className="scene-try"
            onClick={() => {
              setFullscreen(false);
              onTry();
            }}
          >
            现在轮到你了
            <ArrowDownRight size={15} />
          </button>
        )}
      </div>
      <div className="player-caption">
        <span>{String(active + 1).padStart(2, "0")} / 04</span>
        <p>{chapter.caption}</p>
      </div>
      <div className="player-controls">
        <button
          className="player-toggle"
          aria-label={
            playing
              ? "暂停项目讲解"
              : time >= 60
                ? "重新播放项目讲解"
                : "播放项目讲解"
          }
          onClick={toggle}
        >
          {playing ? (
            <Pause size={17} fill="currentColor" />
          ) : time >= 60 ? (
            <RotateCcw size={17} />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <button
          className="icon-btn"
          aria-label="上一章节"
          onClick={() => setTime(chapters[Math.max(0, active - 1)].start)}
        >
          <SkipBack size={14} />
        </button>
        <span className="player-time">{clock(time)}</span>
        <input
          aria-label="讲解进度"
          type="range"
          min={0}
          max={60}
          step={0.1}
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          style={
            { "--progress": `${(time / 60) * 100}%` } as React.CSSProperties
          }
        />
        <span className="player-time">1:00</span>
        <button
          className="icon-btn"
          aria-label="下一章节"
          onClick={() => setTime(chapters[Math.min(3, active + 1)].start)}
        >
          <SkipForward size={14} />
        </button>
      </div>
      <div className="chapter-switcher" aria-label="讲解章节">
        {chapters.map((item, i) => (
          <button
            className={active === i ? "active" : ""}
            key={item.start}
            onClick={() => setTime(item.start)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {item.title}
          </button>
        ))}
      </div>
    </section>
  );
}
