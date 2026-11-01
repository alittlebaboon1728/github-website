import { useState } from "react";
import { ArrowUpRight, Bookmark, Loader2, Sparkles } from "lucide-react";
import { formatNumber } from "../catalog";
import type { Repository } from "../catalog";

function Sparkline({ points }: { points: { at: string; stars: number }[] }) {
  if (points.length < 2) return null;
  const dates = points.map((p) => Date.parse(p.at)),
    stars = points.map((p) => p.stars);
  const min = Math.min(...stars),
    max = Math.max(...stars);
  const x = (i: number) =>
    4 + ((dates[i] - dates[0]) / (dates.at(-1)! - dates[0] || 1)) * 100;
  const y = (i: number) => 30 - ((stars[i] - min) / (max - min || 1)) * 26;
  return (
    <svg
      viewBox="0 0 108 34"
      className="star-sparkline"
      role="img"
      aria-label={`已采集 ${points.length} 个快照，总 stars 从 ${stars[0]} 到 ${stars.at(-1)}`}
    >
      <path
        d={points.map((_, i) => `${i ? "L" : "M"}${x(i)},${y(i)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {points.map((p, i) => (
        <circle key={p.at} cx={x(i)} cy={y(i)} r="1.8" />
      ))}
    </svg>
  );
}

export default function RankingCard({
  repo,
  rank,
  delta,
  points,
  saved,
  generating,
  onSave,
  onPreview,
}: {
  repo: Repository;
  rank: number;
  delta?: number;
  points: { at: string; stars: number }[];
  saved: boolean;
  generating: boolean;
  onSave: () => void;
  onPreview: () => void;
}) {
  const [original, setOriginal] = useState(false);
  const generated = repo.generated;
  return (
    <article
      className={`ranking-row ${generated ? "has-ai-summary" : ""}`}
      aria-label={`第 ${rank} 名 ${repo.fullName}`}
    >
      <span className="ranking-position" aria-hidden="true">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="ranking-project">
        <button
          className="ranking-project-title"
          onClick={onPreview}
          aria-label={`快速了解 ${repo.fullName}`}
        >
          <h2>{repo.name}</h2>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
        <a
          className="ranking-owner"
          href={`https://github.com/${encodeURIComponent(repo.owner)}`}
          target="_blank"
          rel="noreferrer"
        >
          {repo.owner}
        </a>
        <button
          className="ranking-summary"
          onClick={onPreview}
          aria-label={`阅读 ${repo.name} 的介绍`}
        >
          <p>
            {!original && generated
              ? generated.summary
              : repo.description ||
                "作者尚未提供项目简介，可打开项目了解更多。"}
          </p>
        </button>
        <div className="ranking-card-meta">
          {repo.language !== "未标注" && (
            <span className="ranking-language">
              <i style={{ background: repo.color }} />
              {repo.language}
            </span>
          )}
          <span className="ranking-summary-label">
            {generated ? (
              <>
                <Sparkles size={12} />
                {original ? "作者原文" : "AI 中文总结"}
              </>
            ) : generating ? (
              <>
                <Loader2 size={12} className="spin" />
                整理中
              </>
            ) : (
              "作者原文"
            )}
          </span>
          {generated && (
            <button
              className="ranking-original"
              onClick={() => setOriginal((value) => !value)}
              aria-pressed={original}
            >
              {original ? "显示中文" : "查看原文"}
            </button>
          )}
        </div>
      </div>
      <div className="ranking-score">
        <span
          className="ranking-metric"
          data-direction={
            delta !== undefined && delta < 0 ? "negative" : "positive"
          }
        >
          {delta === undefined
            ? formatNumber(repo.stars)
            : `${delta > 0 ? "+" : ""}${delta.toLocaleString("zh-CN")}`}
          <small>{delta === undefined ? "累计星标" : "星标净变化"}</small>
        </span>
        {delta !== undefined && <Sparkline points={points} />}
      </div>
      <button
        className={`icon-btn ranking-save ${saved ? "saved" : ""}`}
        aria-label={`${saved ? "取消收藏" : "收藏"}榜单项目 ${repo.fullName}`}
        aria-pressed={saved}
        onClick={onSave}
      >
        <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
