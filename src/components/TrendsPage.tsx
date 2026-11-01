import { useState } from "react";
import {
  ChevronDown,
  Loader2,
  RefreshCw,
  Star,
  TrendingUp,
} from "lucide-react";
import { normalizeRepo } from "../api";
import type { Repository } from "../catalog";
import { dateLabel, useContent } from "../observatoryApi";
import type { TrendData } from "../observatoryApi";
import { useRankingSummaries } from "../useRankingSummaries";
import ContentFeedback from "./ContentFeedback";
import FilterDisclosure from "./FilterDisclosure";
import RankingCard from "./RankingCard";
import GlassTabs from "./GlassTabs";

export default function TrendsPage({
  compact = false,
  saved,
  onSave,
  onPreview,
}: {
  compact?: boolean;
  saved: Repository[];
  onSave: (repo: Repository) => void;
  onPreview: (repo: Repository, collection?: Repository[]) => void;
}) {
  const params = new URLSearchParams(
    compact ? "" : window.location.hash.split("?")[1] || "",
  );
  const kind = params.get("kind") || "stars",
    language = params.get("language") || "",
    topic = params.get("topic") || "",
    days = params.get("days") || "7";
  const growthView = params.get("view") === "growth";
  const query = new URLSearchParams({ kind, language, topic, days }).toString();
  const { result, loading, error, retry } = useContent<TrendData>(
    `/trends?${query}`,
  );
  const [visible, setVisible] = useState(compact ? 4 : 10);
  const data = result?.data;
  const rawRows = growthView
    ? data?.growth.ready
      ? data.growth.items
      : []
    : (data?.repositories || []).map((repo) => ({
        repo,
        delta: 0,
        points: [],
      }));
  const shown = rawRows.slice(0, visible);
  const summaries = useRankingSummaries(
    shown.map((item) => item.repo.full_name),
    query,
  );
  const rows = rawRows.map((item) => ({
    ...item,
    repo: {
      ...normalizeRepo(item.repo),
      generated: summaries.cards[item.repo.full_name],
    },
  }));
  const collection = rows.map((row) => row.repo);
  const needsRetry = Boolean(
    summaries.error || Object.keys(summaries.errors).length,
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === "view" && value === "growth" && kind === "new")
      next.set("kind", "stars");
    if (value) next.set(key, value);
    else next.delete(key);
    window.location.hash = `/trends?${next}`;
  }
  return (
    <section
      className={`trends-section ranking-page ${compact ? "compact-section" : "content-page"}`}
      aria-label="趋势与榜单"
    >
      <header className="module-heading ranking-heading">
        <div>
          {compact ? <h2>热门开源项目</h2> : <h1>趋势与榜单</h1>}
          <p>关注开源项目的热度与变化。</p>
        </div>
        <button
          className="icon-btn ranking-refresh"
          aria-label="刷新数据"
          title="刷新数据"
          disabled={loading}
          onClick={retry}
        >
          <RefreshCw className={loading ? "spin" : ""} size={18} />
        </button>
      </header>
      {!compact && (
        <div className="ranking-toolbar">
          <GlassTabs
            className="content-tabs ranking-tabs"
            label="数据视图"
            selection={growthView ? "growth" : "ranking"}
          >
            <button
              aria-pressed={!growthView}
              onClick={() => filter("view", "ranking")}
            >
              <Star size={16} />
              排行榜
            </button>
            <button
              aria-pressed={growthView}
              onClick={() => filter("view", "growth")}
            >
              <TrendingUp size={16} />
              热门趋势
            </button>
          </GlassTabs>
          <FilterDisclosure label="筛选榜单范围" initiallyOpen={false}>
            <div className="content-filters ranking-filters">
              {!growthView ? (
                <select
                  aria-label="榜单范围"
                  value={kind}
                  onChange={(e) => filter("kind", e.target.value)}
                >
                  <option value="stars">累计星标</option>
                  <option value="new">最近创建</option>
                </select>
              ) : (
                <select
                  aria-label="趋势窗口"
                  value={days}
                  onChange={(e) => filter("days", e.target.value)}
                >
                  <option value="1">近 1 天</option>
                  <option value="7">近 7 天</option>
                  <option value="30">近 30 天</option>
                </select>
              )}
              <select
                aria-label="榜单语言"
                value={language}
                onChange={(e) => filter("language", e.target.value)}
              >
                <option value="">全部语言</option>
                {[
                  "TypeScript",
                  "JavaScript",
                  "Python",
                  "Go",
                  "Rust",
                  "Java",
                  "C++",
                ].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <select
                aria-label="榜单用途"
                value={topic}
                onChange={(e) => filter("topic", e.target.value)}
              >
                <option value="">全部用途</option>
                <option value="developer-tools">开发工具</option>
                <option value="artificial-intelligence">AI 与智能</option>
                <option value="database">数据与后端</option>
                <option value="design-tools">设计与创意</option>
              </select>
            </div>
          </FilterDisclosure>
        </div>
      )}
      <ContentFeedback
        loading={loading && !result}
        error={error}
        retry={retry}
      />
      {data && (
        <>
          <div className="ranking-caption">
            <span>
              {growthView
                ? `${days} 天星标净变化`
                : kind === "new"
                  ? "近 30 天创建 · 按累计星标排序"
                  : "按累计星标排序"}
            </span>
            <span>{dateLabel(result?.fetchedAt)} 更新</span>
          </div>
          {!!shown.length && (summaries.busy || needsRetry) && (
            <div className="ranking-generation" role="status">
              {summaries.busy ? (
                <>
                  <Loader2 size={13} className="spin" />
                  正在整理中文总结{" "}
                  <span>
                    {summaries.ready} / {shown.length}
                  </span>
                </>
              ) : (
                <>
                  <span title={summaries.error || undefined}>
                    部分中文总结暂未就绪，先显示项目原文。
                  </span>
                  <button onClick={summaries.retry}>重试中文总结</button>
                </>
              )}
            </div>
          )}
          {growthView && !data.growth.ready ? (
            <div className="history-empty ranking-empty">
              <div className="ranking-empty-icon">
                <TrendingUp size={28} strokeWidth={1.5} />
              </div>
              <h2>{data.persistence ? "正在积累数据" : "增长趋势暂不可用"}</h2>
              <p>
                {data.persistence
                  ? `还没有足够的 ${days} 天历史记录。先看看当前受到关注的项目。`
                  : data.persistenceReason}
              </p>
              <button
                className="button outline-button"
                onClick={() => filter("view", "ranking")}
              >
                查看排行榜
              </button>
            </div>
          ) : (
            <div
              className="ranking-list"
              aria-label={growthView ? "项目增长榜" : "项目排行榜"}
            >
              {rows.slice(0, visible).map(({ repo, delta, points }, index) => (
                <RankingCard
                  key={repo.fullName}
                  repo={repo}
                  rank={index + 1}
                  delta={growthView ? delta : undefined}
                  points={points}
                  saved={saved.some((r) => r.fullName === repo.fullName)}
                  generating={
                    summaries.busy && !summaries.errors[repo.fullName]
                  }
                  onSave={() => onSave(repo)}
                  onPreview={() => onPreview(repo, collection)}
                />
              ))}
            </div>
          )}
          {!growthView && !rows.length && (
            <div className="history-empty ranking-empty">
              <h2>暂时没有匹配的项目</h2>
              <p>试试其他语言或用途。</p>
            </div>
          )}
          {!compact && rows.length > visible && (
            <div className="ranking-more">
              <button
                className="button outline-button"
                onClick={() => setVisible((count) => count + 10)}
              >
                查看更多项目
                <ChevronDown size={16} />
              </button>
            </div>
          )}
          {compact && (
            <div className="ranking-more">
              <a className="button outline-button" href="#/trends">
                查看完整榜单
              </a>
            </div>
          )}
          {!compact && (
            <details className="source-details ranking-source-details">
              <summary>数据范围与计算方式</summary>
              <p>{data.scope} 搜索结果不代表 GitHub 全站完整排名。</p>
              <p>{data.growth.coverage}</p>
              {growthView && data.growth.ready && (
                <p>
                  实际比较：{dateLabel(data.growth.from, true)} 至{" "}
                  {dateLabel(data.growth.to, true)}。折线仅连接实际采集点。
                </p>
              )}
              {growthView && !data.growth.ready && (
                <p>
                  当前范围的记录开始于 {dateLabel(data.growth.startedAt)}
                  ，积累足够的可比快照后显示净变化。
                </p>
              )}
              <p>
                快照按 UTC 日首次采集记录。
                {kind === "new" &&
                  "最近创建榜只包含近 30 天创建的项目，排序依据为累计星标，并非近期新增星标。"}
              </p>
              <p>
                中文总结由 AI 根据项目 README
                或作者简介生成；可切换原文，并在项目介绍中查看依据。
              </p>
              <p>
                {dateLabel(result?.fetchedAt, true)} ·{" "}
                {result?.source === "cache" ? "缓存数据" : "本次数据"}
              </p>
              <code>{data.query}</code>
              {data.incomplete && <p>GitHub 此次返回部分搜索结果。</p>}
            </details>
          )}
        </>
      )}
    </section>
  );
}
