import { ArrowUpRight, BookOpen, Info, Loader2, RefreshCw } from "lucide-react";
import type { Repository } from "../catalog";
import { getProjectGuide } from "../projectGuides";
import { readmeParagraphs, useReadme } from "../useReadme";
import ProjectImage from "./ProjectImage";

export default function ProjectIntroduction({
  repo,
  compact = false,
  withPreview = true,
}: {
  repo: Repository;
  compact?: boolean;
  withPreview?: boolean;
}) {
  const guide = getProjectGuide(repo);
  const generated = repo.generated;
  const { content, error, snapshot, retry } = useReadme(
    repo,
    !guide && !generated,
  );
  const paragraphs = content ? readmeParagraphs(content.content) : [];
  if (generated)
    return (
      <div
        className={`project-introduction ${compact ? "introduction-compact" : ""}`}
      >
        {withPreview && <ProjectImage repo={repo} />}
        <section className="introduction-body">
          <div className="intro-section-label">
            AI 中文整理 · 依据项目
            {generated.sourceKind === "readme" ? " README" : "简介"}
          </div>
          <h2>{generated.title}</h2>
          <p>{generated.summary}</p>
          <p>适合：{generated.audience}</p>
        </section>
        <section className="intro-features">
          <h3>可以用它做什么</h3>
          <div>
            {generated.features.map((feature, index) => (
              <div key={feature.title}>
                <span>{index + 1}</span>
                <div>
                  <h4>{feature.title}</h4>
                  <p>{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="introduction-body">
          <h3>从这里开始</h3>
          <p>{generated.start}</p>
        </section>
        <div className="intro-note">
          <Info size={16} />
          <p>
            {generated.limitation}
            {generated.sourceWarning && ` ${generated.sourceWarning}`}
          </p>
        </div>
        <div className="intro-source">
          <BookOpen size={14} />
          <span>
            {generated.model} 依据项目资料整理 ·{" "}
            {new Date(generated.generatedAt).toLocaleDateString("zh-CN")}
            ；请以项目原文为准。
          </span>
          <a href={generated.sourceUrl} target="_blank" rel="noreferrer">
            核对原文
            <ArrowUpRight size={13} />
          </a>
        </div>
      </div>
    );
  return (
    <div
      className={`project-introduction ${compact ? "introduction-compact" : ""}`}
    >
      {withPreview && <ProjectImage repo={repo} />}
      <section className="introduction-body">
        <div className="intro-section-label">
          <span className="author-avatar">
            {repo.owner.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {repo.owner}
            <small>{guide ? "README 中文转述" : "项目作者"}</small>
          </span>
        </div>
        <h2>{guide?.title || repo.name}</h2>
        {guide ? (
          guide.paragraphs.map((p) => <p key={p}>{p}</p>)
        ) : (
          <>
            <p>{repo.description}</p>
            {paragraphs.length > 0 ? (
              paragraphs.map((p) => <p key={p}>{p}</p>)
            ) : !error && !content ? (
              <div className="intro-loading">
                <Loader2 size={16} className="spin" />
                正在读取作者的 README…
              </div>
            ) : (
              <p className="intro-document-note">
                {error
                  ? "README 暂时无法读取，可以打开 GitHub 查看。"
                  : "作者的完整说明可在下方 README 中阅读。"}
              </p>
            )}
            {error && (
              <button className="text-action" onClick={retry}>
                <RefreshCw size={13} />
                重新读取
              </button>
            )}
          </>
        )}
      </section>
      {guide && (
        <>
          <section className="intro-features">
            <h3>可以用它做什么</h3>
            <div>
              {guide.features.map((feature, index) => (
                <div key={feature.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{feature.title}</h4>
                    <p>{feature.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="intro-start">
            <h3>从这里开始</h3>
            {guide.steps.map((step, index) => (
              <a
                key={step.title}
                href={step.href}
                target="_blank"
                rel="noreferrer"
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </section>
          <div className="intro-note">
            <Info size={16} />
            <p>{guide.note}</p>
          </div>
        </>
      )}
      <div className="intro-source">
        <BookOpen size={14} />
        <span>
          {guide
            ? "依据项目 README 整理，以作者视角转述，非作者原话。"
            : snapshot
              ? "README 参考快照 · 2026/10/31"
              : "保留作者原文。"}
        </span>
        <a href={`${repo.url}#readme`} target="_blank" rel="noreferrer">
          查看原文
          <ArrowUpRight size={12} />
        </a>
      </div>
    </div>
  );
}
