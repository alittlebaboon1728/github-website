import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  Copy,
  Globe2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { ApiError, fetchRepository } from "./api";
import { formatNumber, hasProjectTrial, relativeDate } from "./catalog";
import type { Repository } from "./catalog";
import ReadmePanel from "./components/ReadmePanel";
import ProjectIntroduction from "./components/ProjectIntroduction";
import ExcalidrawOverview from "./components/ExcalidrawOverview";
import { excalidrawGuide } from "./excalidrawGuide";
import GlassButton from "./components/GlassButton";
import GlassTabs from "./components/GlassTabs";

export default function ProjectDetail({
  fullName,
  initialRepo,
  dark,
  saved,
  onSave,
  onNotify,
  onTopic,
}: {
  fullName: string;
  initialRepo?: Repository;
  dark: boolean;
  saved: boolean;
  onSave: (repo: Repository) => void;
  onNotify: (message: string) => void;
  onTopic: (topic: string) => void;
}) {
  const [repo, setRepo] = useState(initialRepo || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [source, setSource] = useState("");
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState("overview");
  const [labOpen, setLabOpen] = useState(false);
  const example = hasProjectTrial(fullName);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchRepository(fullName, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRepo({ ...result.data, generated: initialRepo?.generated });
          setSource(
            `${result.source === "cache" ? "近期缓存" : "实时数据"} · ${new Date(result.fetchedAt).toLocaleString("zh-CN")}`,
          );
        }
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(problem);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fullName, nonce]);
  function tryEditor() {
    setTab("overview");
    setLabOpen(true);
    requestAnimationFrame(() => {
      const section = document.getElementById("hands-on");
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    });
  }
  async function copy() {
    if (!repo) return;
    try {
      await navigator.clipboard.writeText(
        `git clone https://github.com/${repo.fullName}.git`,
      );
      onNotify("克隆命令已复制。");
    } catch {
      onNotify("剪贴板暂不可用，请手动复制命令。");
    }
  }
  if (!repo)
    return (
      <div className="detail-loading">
        {loading ? (
          <>
            <Loader2 className="spin" />
            <h2>正在打开这个项目…</h2>
          </>
        ) : (
          <>
            <Globe2 size={30} />
            <h2>{error?.message || "没有找到这个公开项目。"}</h2>
            <p>检查仓库链接，或返回发现页寻找新的项目。</p>
            <button
              className="button primary-button"
              onClick={() => setNonce((n) => n + 1)}
            >
              重新读取
              <RefreshCw size={14} />
            </button>
            <a className="text-action" href="#/discover">
              返回项目发现
            </a>
          </>
        )}
      </div>
    );
  return (
    <article
      className={`project-detail readable-project ${example ? "excalidraw-detail" : ""}`}
    >
      <div className="reader-topline">
        <a href={example ? "#/stories" : "#/discover"}>
          <ChevronLeft size={16} />
          {example ? "返回项目试用" : "返回项目发现"}
        </a>
        <div>
          <GlassButton
            aria-label={`${saved ? "取消收藏" : "收藏"} ${repo.fullName}`}
            aria-pressed={saved}
            onClick={() => onSave(repo)}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
            {saved ? "已收藏" : "收藏项目"}
          </GlassButton>
          <a href={repo.url} target="_blank" rel="noreferrer">
            项目源码
            <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
      <header className="reader-header">
        <div>
          <h1>{example ? "Excalidraw" : repo.name}</h1>
          <p>{example ? excalidrawGuide.subtitle : repo.description}</p>
        </div>
      </header>
      {error && (
        <div className="detail-data-error" role="alert">
          {error.message} 当前展示的是已保存资料。
          <button onClick={() => setNonce((n) => n + 1)}>重试</button>
        </div>
      )}
      <GlassTabs
        as="nav"
        className="reader-tabs"
        label="项目内容"
        selection={tab}
      >
        {[
          { id: "overview", label: example ? "中文使用说明" : "项目概览" },
          { id: "readme", label: "README 原文" },
          { id: "repository", label: "仓库资料" },
        ].map((item) => (
          <GlassButton
            key={item.id}
            variant="tab"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </GlassButton>
        ))}
      </GlassTabs>
      {tab === "readme" ? (
        <ReadmePanel repo={repo} />
      ) : tab === "repository" ? (
        <section className="repository-facts reader-facts">
          <h2>仓库资料</h2>
          <p>
            {loading
              ? "正在更新仓库信息…"
              : error
                ? "当前为已保存资料"
                : source}
          </p>
          <dl>
            <div>
              <dt>开源许可</dt>
              <dd>{repo.license}</dd>
            </div>
            <div>
              <dt>主要语言</dt>
              <dd>{repo.language}</dd>
            </div>
            <div>
              <dt>星标</dt>
              <dd>{formatNumber(repo.stars)}</dd>
            </div>
            <div>
              <dt>复刻</dt>
              <dd>{formatNumber(repo.forks)}</dd>
            </div>
            <div>
              <dt>最近推送</dt>
              <dd>{relativeDate(repo.updated)}</dd>
            </div>
            <div>
              <dt>创建日期</dt>
              <dd>
                {repo.createdAt
                  ? new Date(repo.createdAt).toLocaleDateString("zh-CN")
                  : "未提供"}
              </dd>
            </div>
            <div>
              <dt>开放议题与请求</dt>
              <dd>{repo.openIssues?.toLocaleString("zh-CN") ?? "未提供"}</dd>
            </div>
            <div>
              <dt>默认分支</dt>
              <dd>{repo.defaultBranch}</dd>
            </div>
          </dl>
          <div className="clone-line">
            <code>git clone https://github.com/{repo.fullName}.git</code>
            <button aria-label="复制克隆命令" onClick={copy}>
              <Copy size={16} />
            </button>
          </div>
          <div className="repository-fact-links">
            <a href={`${repo.url}/issues`} target="_blank" rel="noreferrer">
              查看社区讨论
              <ArrowUpRight size={14} />
            </a>
            <a href={repo.url} target="_blank" rel="noreferrer">
              浏览源代码
              <ArrowUpRight size={14} />
            </a>
          </div>
        </section>
      ) : example ? (
        <ExcalidrawOverview
          dark={dark}
          labOpen={labOpen}
          onTry={tryEditor}
          onNotify={onNotify}
        />
      ) : (
        <>
          <ProjectIntroduction repo={repo} />
          <div className="repository-topic-strip">
            {repo.tags.slice(0, 5).map((tag) => (
              <button key={tag} onClick={() => onTopic(tag)}>
                {tag}
              </button>
            ))}
          </div>
          <ReadmePanel repo={repo} />
        </>
      )}
    </article>
  );
}
