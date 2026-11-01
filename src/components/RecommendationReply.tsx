import type { CSSProperties } from "react";
import { ArrowUpRight, Check, Info, RefreshCw } from "lucide-react";
import { normalizeRepo } from "../api";
import type { ApiEnvelope } from "../api";
import type { Repository } from "../catalog";
import { dateLabel } from "../observatoryApi";
import type { RecommendationData } from "../observatoryApi";
import RepositoryCard from "./RepositoryCard";
import RepositoryGrid from "./RepositoryGrid";
import ReactMarkdown from "react-markdown";

export type ReplyActions = {
  saved: Repository[];
  onSave: (repo: Repository) => void;
  onPreview: (repo: Repository, collection?: Repository[]) => void;
  onOpen: (repo: Repository) => void;
};

export default function RecommendationReply({
  result,
  saved,
  onSave,
  onPreview,
  onOpen,
  onRetry,
}: ReplyActions & {
  result: ApiEnvelope<RecommendationData>;
  onRetry?: () => void;
}) {
  const data = result.data;
  if (data.answer)
    return (
      <div className="chat-reply chat-project-answer">
        <div className="project-answer-body">
          <ReactMarkdown
            skipHtml
            components={{
              a: ({ href, children }) =>
                /^https?:\/\//i.test(href || "") ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ) : (
                  <span>{children}</span>
                ),
              img: () => null,
            }}
          >
            {data.answer.text}
          </ReactMarkdown>
        </div>
        {data.warning && (
          <p className="chat-warning">
            <Info size={14} />
            {data.warning}
          </p>
        )}
        <div className="chat-reply-tools">
          {onRetry && (
            <button
              className="icon-btn"
              aria-label="重新回答"
              title="重新回答"
              onClick={onRetry}
            >
              <RefreshCw size={15} />
            </button>
          )}
          <details className="chat-sources">
            <summary>
              <Info size={14} />
              项目原文
            </summary>
            <div>
              {data.answer.quotes.map((quote, index) => (
                <blockquote key={index}>{quote}</blockquote>
              ))}
              <a href={data.answer.sourceUrl} target="_blank" rel="noreferrer">
                {data.answer.repo}
                <ArrowUpRight size={12} />
              </a>
              <p>{dateLabel(data.answer.fetchedAt, true)} · README</p>
            </div>
          </details>
        </div>
      </div>
    );
  const repos = data.selections.map((selection) =>
    normalizeRepo(selection.repo),
  );
  return (
    <div className="chat-reply">
      <p className="chat-answer-summary">{data.plan.summary}</p>
      <div className="chat-result-meta">
        <span>
          {repos.length
            ? `${repos.length} 个项目，看看有没有适合你的。`
            : "暂时没有找到符合条件、且能核实的项目。"}
        </span>
        <span className="chat-result-count">
          <Check size={13} />
          已核对 {data.verified} 份 README
        </span>
      </div>
      {data.warning && (
        <p className="chat-warning">
          <Info size={14} />
          {data.warning}
        </p>
      )}
      <RepositoryGrid className="recommendation-grid">
        {data.selections.map((selection, index) => (
          <div
            className="recommendation-item"
            key={selection.repo.full_name}
            style={
              {
                "--reply-delay": `${Math.min(index, 5) * 85}ms`,
              } as CSSProperties
            }
          >
            <div className="chat-card-enter">
              <RepositoryCard
                repo={repos[index]}
                saved={saved.some(
                  (repo) => repo.fullName === repos[index].fullName,
                )}
                onSave={() => onSave(repos[index])}
                onOpen={() => onOpen(repos[index])}
                onPreview={() => onPreview(repos[index], repos)}
                recommendationSummary={`${selection.purpose}。${selection.reason}`}
              />
              <div className="recommendation-reason">
                {!!selection.checks.length && (
                  <div className="condition-checks">
                    {selection.checks.map((condition) => (
                      <span
                        key={condition.id}
                        data-status={condition.status}
                        title={condition.quote || "README 中尚未确认"}
                      >
                        {condition.status === "met" ? (
                          <Check size={12} />
                        ) : (
                          <Info size={12} />
                        )}
                        {condition.label} ·{" "}
                        {condition.status === "met"
                          ? "有依据"
                          : condition.status === "not-met"
                            ? "不满足"
                            : "未确认"}
                      </span>
                    ))}
                  </div>
                )}
                <details className="recommendation-evidence">
                  <summary>查看原文依据与时间</summary>
                  <div className="chat-evidence-content">
                    <blockquote>{selection.evidence}</blockquote>
                    {selection.checks
                      .filter((condition) => condition.quote)
                      .map((condition) => (
                        <p key={condition.id}>
                          <strong>{condition.label}：</strong>
                          {condition.quote}
                        </p>
                      ))}
                    {!!selection.limitations.length && (
                      <ul className="recommendation-limits">
                        {selection.limitations.map((limitation, i) => (
                          <li key={i}>
                            {limitation.unknown ? "待核实：" : "使用限制："}
                            {limitation.text}
                            {limitation.quote && <p>{limitation.quote}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p>
                      README ·{" "}
                      {selection.source === "cache" ? "缓存" : "本次取得"} ·{" "}
                      {dateLabel(selection.fetchedAt, true)}
                    </p>
                    <a
                      href={selection.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      核对 README 原文
                      <ArrowUpRight size={12} />
                    </a>
                  </div>
                </details>
              </div>
            </div>
          </div>
        ))}
      </RepositoryGrid>
      {!repos.length && (
        <p className="chat-empty-results">
          可以放宽一个条件，或换一种用途描述，我再帮你找找。
        </p>
      )}
      <div className="chat-reply-tools">
        {onRetry && (
          <button
            className="icon-btn"
            aria-label="重新生成推荐"
            title="重新生成推荐"
            onClick={onRetry}
          >
            <RefreshCw size={15} />
          </button>
        )}
        <details className="chat-sources">
          <summary>
            <Info size={14} />
            检索来源
          </summary>
          <div>
            <p>
              检索 {data.searched} 个候选，核对 {data.verified} 份
              README。必须条件不满足或无法核实的项目不进入推荐。未实际运行项目，请核对原文。
            </p>
            {data.plan.queries.map((query) => (
              <code key={query}>{query}</code>
            ))}
            <p>
              {dateLabel(result.fetchedAt, true)} ·{" "}
              {result.source === "cache" ? "近期缓存" : "本轮检索"}
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
