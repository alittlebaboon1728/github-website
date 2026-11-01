import { useState } from "react";
import {
  Bookmark,
  BookOpen,
  GitFork,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import { formatNumber, hasProjectTrial, relativeDate } from "../catalog";
import type { Repository } from "../catalog";
import { getProjectGuide } from "../projectGuides";
import ProjectImage from "./ProjectImage";

export default function RepositoryCard({
  repo,
  saved,
  onSave,
  onOpen,
  onPreview,
  generating = false,
  generationError,
  recommendationSummary,
}: {
  repo: Repository;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onPreview: () => void;
  generating?: boolean;
  generationError?: string;
  recommendationSummary?: string;
}) {
  const [original, setOriginal] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const guide = getProjectGuide(repo);
  const generated = repo.generated;
  const summary = original
    ? repo.description
    : recommendationSummary ||
      generated?.summary ||
      guide?.intro ||
      repo.description;
  return (
    <article
      className={`project-card project-exhibit trend-project-card ${generated ? "has-ai-summary" : ""}`}
    >
      <ProjectImage repo={repo} onPreview={onPreview} />
      <div className="trend-card-content">
        <header className="trend-card-heading">
          <a
            className="trend-author-avatar"
            href={`https://github.com/${encodeURIComponent(repo.owner)}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`项目作者 ${repo.owner}`}
          >
            {repo.avatar && !avatarFailed ? (
              <img
                src={repo.avatar}
                width="36"
                height="36"
                loading="lazy"
                alt=""
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span>{repo.owner.slice(0, 1).toUpperCase()}</span>
            )}
          </a>
          <div className="trend-card-identity">
            <button
              className="gallery-title"
              onClick={hasProjectTrial(repo.fullName) ? onOpen : onPreview}
              title={repo.fullName}
            >
              <h3>{repo.name}</h3>
            </button>
            <a
              className="trend-card-author"
              href={`https://github.com/${encodeURIComponent(repo.owner)}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`作者 @${repo.owner}`}
            >
              @{repo.owner}
            </a>
          </div>
          <button
            className={`save-btn ${saved ? "saved" : ""}`}
            aria-label={`${saved ? "取消收藏" : "收藏"} ${repo.fullName}`}
            aria-pressed={saved}
            onClick={onSave}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          </button>
        </header>
        {recommendationSummary ? (
          <div className="trend-summary-source">
            <span>
              <Sparkles size={12} aria-hidden="true" />
              {original ? "GitHub 作者简介" : "AI 推荐"}
            </span>
            <button
              className="bare-control summary-language-toggle"
              onClick={() => setOriginal((value) => !value)}
              aria-pressed={original}
            >
              {original ? "显示中文" : "显示原文"}
            </button>
          </div>
        ) : generated ? (
          <div className="trend-summary-source">
            <span>
              <Sparkles size={12} aria-hidden="true" />{" "}
              {original ? "GitHub 作者简介" : "来自 AI 总结"}
            </span>
            <button
              className="bare-control summary-language-toggle"
              onClick={() => setOriginal((value) => !value)}
              aria-pressed={original}
            >
              {original ? "显示中文" : "显示原文"}
            </button>
          </div>
        ) : (
          guide && (
            <div className="trend-summary-source">
              <span>README 中文整理</span>
              <button
                className="bare-control summary-language-toggle"
                aria-pressed={original}
                onClick={() => setOriginal((value) => !value)}
              >
                {original ? "显示中文" : "显示原文"}
              </button>
            </div>
          )
        )}
        <button
          className="trend-summary"
          onClick={onPreview}
          aria-label={`快速了解 ${repo.fullName}`}
          title="打开项目介绍"
        >
          <p className="exhibit-description">{summary}</p>
        </button>
        {generating && !generated && !generationError && (
          <p className="card-generation-status">
            <Loader2 size={12} className="spin" />
            正在生成中文介绍…
          </p>
        )}
        {generationError && !generated && (
          <p className="card-generation-error">{generationError}</p>
        )}
        {!!repo.tags.length && (
          <div className="trend-card-topics" aria-label="仓库主题">
            {repo.tags.slice(0, 5).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        <footer className="trend-card-footer">
          <div className="trend-card-stats">
            {repo.language !== "未标注" && (
              <span>
                <i style={{ background: repo.color }} />
                {repo.language}
              </span>
            )}
            <span title={`${repo.stars.toLocaleString("zh-CN")} 个星标`}>
              <Star size={13} />
              {formatNumber(repo.stars)}
            </span>
            {repo.forks !== null && (
              <span title={`${repo.forks.toLocaleString("zh-CN")} 次派生`}>
                <GitFork size={12} />
                {formatNumber(repo.forks)}
              </span>
            )}
          </div>
          <div className="trend-card-actions">
            <time
              dateTime={repo.updated || undefined}
              title={
                repo.updated
                  ? `最近推送：${new Date(repo.updated).toLocaleString("zh-CN")}`
                  : "当前数据来源未提供最近推送时间"
              }
            >
              {repo.archived ? "已归档" : relativeDate(repo.updated)}
            </time>
            <button
              onClick={onPreview}
              aria-label={`阅读 ${repo.name} 的介绍`}
              title="快速阅读"
            >
              <BookOpen size={14} />
            </button>
          </div>
        </footer>
      </div>
    </article>
  );
}
