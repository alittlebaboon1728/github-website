import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Bookmark,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  Github,
  Globe2,
  Info,
  Loader2,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { fetchRepository, repositoryFromInput } from "./api";
import {
  categories,
  hasProjectTrial,
  searchAliases,
  snapshotRepos,
} from "./catalog";
import type { Repository } from "./catalog";
import Dialog from "./components/Dialog";
import DiscoveryShelf from "./components/DiscoveryShelf";
import CategoryFilters from "./components/CategoryFilters";
import RepositoryCard from "./components/RepositoryCard";
import RepositoryGrid from "./components/RepositoryGrid";
import QuickRead from "./components/QuickRead";
import GitHubPulse from "./components/GitHubPulse";
import ProjectSearch from "./components/ProjectSearch";
import SiteNavigation from "./components/SiteNavigation";
import "./components/discovery-hero.css";
import TrendsPage from "./components/TrendsPage";
import DemandSearch from "./components/DemandSearch";
import { conversationPath, usesAi, useContent } from "./observatoryApi";
import { useGeneratedCards } from "./useGeneratedCards";
import { useGlassLight } from "./useGlassLight";
import { useLiquidRefraction } from "./useLiquidRefraction";
import type { SearchMode } from "./observatoryApi";
import FilterDisclosure from "./components/FilterDisclosure";
import { useDiscoverySearch } from "./useDiscoverySearch";
import {
  useNavigationPreload,
  preloadCategory,
  preloadSection,
} from "./navigationPreload";
import TrialLibrary from "./components/TrialLibrary";
import ProjectDetail from "./ProjectDetail";
import TrialPage from "./components/TrialPage";

type Route = {
  page:
    "discover" | "saved" | "stories" | "project" | "trends" | "ask" | "trial";
  fullName?: string;
  category: string;
  query: string;
  search: string;
};
type DiscoveryState = {
  browseCategory: string;
  browseQuery: string;
  language: string;
  sort: string;
  scroll: number;
};
function parseRoute(): Route {
  const raw = window.location.hash.slice(1) || "/discover";
  const [path, search = ""] = raw.split("?");
  const params = new URLSearchParams(search);
  const match = path.match(/^\/project\/([\w.-]+)\/([\w.-]+)$/);
  const trial = path.match(/^\/trial\/([\w.-]+)\/([\w.-]+)$/);
  return {
    page: trial
      ? "trial"
      : match && hasProjectTrial(`${match[1]}/${match[2]}`)
        ? "project"
        : path === "/saved"
          ? "saved"
          : path === "/trends"
            ? "trends"
            : path === "/ask"
              ? "ask"
              : path === "/stories"
                ? "stories"
                : "discover",
    fullName: trial
      ? `${trial[1]}/${trial[2]}`
      : match
        ? `${match[1]}/${match[2]}`
        : undefined,
    category: categories.some((c) => c.id === params.get("category"))
      ? params.get("category")!
      : "all",
    query: params.get("q") || "",
    search,
  };
}
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}
function move(path: string) {
  if (window.location.hash === `#${path}`) return;
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function ExplorerApp() {
  useGlassLight();
  useLiquidRefraction();
  const [route, setRoute] = useState(parseRoute);
  const [dark, setDark] = useState(() => stored("gh-design-dark", false));
  const [sidebar, setSidebar] = useState(false);
  const [previewRepo, setPreviewRepo] = useState<Repository | null>(null);
  const [previewCollection, setPreviewCollection] = useState<
    Repository[] | null
  >(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [projectOpening, setProjectOpening] = useState(false);
  const previewRequest = useRef<AbortController | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [draft, setDraft] = useState(route.query);
  const [browseCategory, setBrowseCategory] = useState(route.category);
  const [browseQuery, setBrowseQuery] = useState(route.query);
  const browserRef = useRef<HTMLElement>(null);
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState("stars");
  const [nonce, setNonce] = useState(0);
  const [saved, setSaved] = useState<Repository[]>(() => {
    const value = stored<Repository[]>("observatory-saved-v1", []);
    return Array.isArray(value) ? value : [];
  });
  const [toast, setToast] = useState("");
  const repoMemory = useRef(
    new Map(snapshotRepos.map((repo) => [repo.fullName, repo])),
  );
  const category =
    categories.find((c) => c.id === browseCategory) || categories[0];
  const apiQuery = browseQuery
    ? searchAliases[browseQuery.trim()] || browseQuery.trim()
    : category.query;
  const query = language ? `${apiQuery} language:${language}` : apiQuery;
  const {
    items,
    page,
    total,
    source,
    fetchedAt,
    sourceNote,
    incomplete,
    exhausted,
    loading,
    error,
    loadMore,
    retry: retrySearch,
    serverManaged,
    pendingCount,
    preparationError,
    filterPreview,
    refreshPending,
  } = useDiscoverySearch(
    query,
    sort,
    route.page === "discover",
    nonce,
    !browseQuery && browseCategory === "all" && !language,
  );
  const { result: serviceStatus } = useContent<{
    cardGeneration: boolean;
    discoveryBackground?: boolean;
  }>("/status");
  useNavigationPreload(
    route.page === "discover" && !!source,
    Boolean(serviceStatus?.data.discoveryBackground),
  );
  const aiCards = useGeneratedCards({
    query,
    sort,
    revision: nonce,
    enabled: Boolean(
      serviceStatus?.data.cardGeneration &&
      !serviceStatus.data.discoveryBackground &&
      !serverManaged &&
      route.page === "discover" &&
      source &&
      source !== "snapshot",
    ),
  });
  const navigationCache = useRef(new Map<string, DiscoveryState>());
  const activeRoute = useRef({ route, state: {} as DiscoveryState });
  activeRoute.current = {
    route,
    state: {
      browseCategory,
      browseQuery,
      language,
      sort,
      scroll: window.scrollY,
    },
  };

  useEffect(() => {
    function change() {
      const previous = activeRoute.current;
      if (previous.route.page === "discover") {
        navigationCache.current.set(previous.route.search, {
          ...previous.state,
          scroll: window.scrollY,
        });
      }
      const next = parseRoute();
      const savedState =
        next.page === "discover"
          ? navigationCache.current.get(next.search)
          : null;
      setRoute(next);
      setSidebar(false);
      setPreviewRepo(null);
      setPreviewCollection(null);
      previewRequest.current?.abort();
      setProjectOpening(false);
      if (savedState) {
        setBrowseCategory(savedState.browseCategory);
        setBrowseQuery(savedState.browseQuery);
        setLanguage(savedState.language);
        setSort(savedState.sort);
        requestAnimationFrame(() =>
          window.scrollTo({ top: savedState.scroll, behavior: "instant" }),
        );
      } else {
        setBrowseCategory(next.category);
        setBrowseQuery(next.query);
        setLanguage("");
        setSort("stars");
      }
    }
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    setDraft(browseQuery);
  }, [browseQuery]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("gh-design-dark", JSON.stringify(dark));
  }, [dark]);
  useEffect(() => {
    try {
      localStorage.setItem("observatory-saved-v1", JSON.stringify(saved));
    } catch {
      setToast("浏览器存储已满，收藏暂时只保留在本页。");
    }
  }, [saved]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPreviewRepo(null);
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setSidebar(false);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    for (const repo of items) repoMemory.current.set(repo.fullName, repo);
  }, [items]);

  function submitSearch(value: string, mode = searchMode) {
    const text = value.trim();
    setSearchOpen(false);
    setSearchText("");
    if (!text && mode === "ai") {
      move(conversationPath({ turns: [], overrides: [] }));
      return;
    }
    const fullName = repositoryFromInput(text);
    if (fullName) {
      if (hasProjectTrial(fullName)) move(`/project/${fullName}`);
      else void previewName(fullName);
      return;
    }
    if (text && usesAi(text, mode)) {
      move(conversationPath({ turns: [text], overrides: [] }));
      return;
    }
    const path = text ? `/discover?q=${encodeURIComponent(text)}` : "/discover";
    if (window.location.hash === `#${path}`) {
      setBrowseQuery(text);
      setBrowseCategory("all");
      setNonce((n) => n + 1);
      return;
    }
    move(path);
  }
  const notify = useCallback((value: string) => setToast(value), []);
  function toggleSave(repo: Repository) {
    setSaved((current) =>
      current.some((r) => r.fullName === repo.fullName)
        ? current.filter((r) => r.fullName !== repo.fullName)
        : [repo, ...current],
    );
  }
  function openRepo(repo: Repository) {
    repoMemory.current.set(repo.fullName, repo);
    if (hasProjectTrial(repo.fullName)) move(`/project/${repo.fullName}`);
    else previewProject(repo);
  }
  function previewProject(repo: Repository, collection?: Repository[]) {
    previewRequest.current?.abort();
    setProjectOpening(false);
    repoMemory.current.set(repo.fullName, repo);
    setPreviewCollection(collection || [repo]);
    setPreviewRepo(repo);
  }
  async function previewName(fullName: string) {
    previewRequest.current?.abort();
    const cached =
      repoMemory.current.get(fullName) ||
      saved.find((repo) => repo.fullName === fullName);
    if (cached) {
      setProjectOpening(false);
      previewProject(cached);
      return;
    }
    const controller = new AbortController();
    previewRequest.current = controller;
    setProjectOpening(true);
    try {
      const result = await fetchRepository(fullName, controller.signal);
      if (!controller.signal.aborted) previewProject(result.data);
    } catch (error) {
      if (!controller.signal.aborted)
        setToast(error instanceof Error ? error.message : "项目暂时无法打开。");
    } finally {
      if (!controller.signal.aborted) setProjectOpening(false);
    }
  }
  useEffect(() => {
    if (route.page !== "discover" || !route.fullName) return;
    // Existing project bookmarks now open the same reading dialog on discovery.
    window.history.replaceState(window.history.state, "", "#/discover");
    void previewName(route.fullName);
  }, [route.page, route.fullName]);
  const displayItems =
    route.page === "saved"
      ? saved
      : aiCards.enabled && aiCards.repositories.length
        ? aiCards.repositories
        : items;
  const quickReadItems = previewCollection || displayItems;
  const trendScope = new URLSearchParams(route.search);
  trendScope.delete("view");
  function selectCategory(id: string, reveal = false) {
    setBrowseCategory(id);
    setBrowseQuery("");
    setDraft("");
    if (reveal)
      requestAnimationFrame(() =>
        browserRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        }),
      );
  }

  const previewIndex = previewRepo
    ? quickReadItems.findIndex((repo) => repo.fullName === previewRepo.fullName)
    : -1;
  const isHome =
    route.page === "discover" &&
    !route.query &&
    route.category === "all" &&
    !new URLSearchParams(route.search).has("browse");
  return (
    <div className="observatory-shell discovery-edition">
      <a
        href="#main-content"
        className="skip-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到内容
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <a
            className="site-brand"
            href="#/discover"
            aria-label="开源观测站首页"
          >
            <span>
              <Github size={23} />
            </span>
            <strong>开源观测站</strong>
            <small>GitHub 项目指南</small>
          </a>
          <SiteNavigation
            active={
              route.page === "ask"
                ? "discover"
                : route.page === "project" || route.page === "trial"
                  ? "stories"
                  : route.page
            }
            open={sidebar}
            savedCount={saved.length}
            onIntent={preloadSection}
          />
          <div className="site-tools">
            <button
              className="icon-btn"
              aria-label={dark ? "切换浅色主题" : "切换深色主题"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <a
              className="header-github"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              aria-label="前往 GitHub"
            >
              <Github size={18} />
            </a>
            <button
              className="icon-btn nav-menu"
              aria-label={sidebar ? "关闭导航" : "打开导航"}
              aria-expanded={sidebar}
              aria-controls="project-navigation"
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
      </header>
      <main
        className={`observatory-content ${route.page === "ask" ? "chat-page" : ""}`}
        id="main-content"
        tabIndex={-1}
      >
        {route.page === "trial" && route.fullName ? (
          <Suspense
            fallback={
              <div className="page-loader">
                <Loader2 className="spin" />
                正在打开试用…
              </div>
            }
          >
            <TrialPage
              key={route.fullName}
              fullName={route.fullName}
              dark={dark}
            />
          </Suspense>
        ) : route.page === "stories" ? (
          <Suspense
            fallback={
              <div className="page-loader">
                <Loader2 className="spin" />
                正在打开试用列表…
              </div>
            }
          >
            <TrialLibrary />
          </Suspense>
        ) : route.page === "project" && route.fullName ? (
          <Suspense
            fallback={
              <div className="page-loader">
                <Loader2 className="spin" />
                正在打开项目…
              </div>
            }
          >
            <ProjectDetail
              key={route.fullName}
              fullName={route.fullName}
              initialRepo={
                repoMemory.current.get(route.fullName) ||
                saved.find((r) => r.fullName === route.fullName)
              }
              dark={dark}
              saved={saved.some((r) => r.fullName === route.fullName)}
              onSave={toggleSave}
              onNotify={notify}
              onTopic={(topic) => submitSearch(`topic:${topic}`)}
            />
          </Suspense>
        ) : route.page === "trends" ? (
          <TrendsPage
            key={trendScope.toString()}
            saved={saved}
            onSave={toggleSave}
            onPreview={previewProject}
          />
        ) : (
          <>
            {isHome ? (
              <section className="discovery-hero" aria-label="开源项目搜索">
                <div className="discovery-hero-copy">
                  <h1 className="discovery-hero-title">
                    <span className="hero-title-line">
                      让好想法，
                      <Asterisk
                        className="hero-title-flower"
                        strokeWidth={1.25}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="hero-title-line">从开源开始。</span>
                  </h1>
                  <p className="hero-title-english" lang="en">
                    Good ideas, open beginnings.
                  </p>
                  <ProjectSearch
                    value={draft}
                    onChange={setDraft}
                    mode={searchMode}
                    onModeChange={setSearchMode}
                    onSubmit={submitSearch}
                  />
                </div>
                <GitHubPulse />
              </section>
            ) : route.page !== "ask" ? (
              <>
                <section className="gallery-heading">
                  <div>
                    <h1>
                      {route.page === "saved"
                        ? "收藏的项目"
                        : browseQuery
                          ? `搜索“${browseQuery}”`
                          : browseCategory !== "all"
                            ? category.name
                            : "发现值得用的开源项目"}
                    </h1>
                    <p>
                      {route.page === "saved"
                        ? "留着之后慢慢看，收藏保存在当前浏览器。"
                        : "工具、教程、资源清单，按你要做的事来找。"}
                    </p>
                  </div>
                  {route.page === "discover" && (
                    <span className="heading-github">
                      <Github size={15} />
                      来自 GitHub 公开仓库
                    </span>
                  )}
                </section>
                {route.page === "discover" && (
                  <div className="discovery-search-compact">
                    <ProjectSearch
                      value={draft}
                      onChange={setDraft}
                      mode={searchMode}
                      onModeChange={setSearchMode}
                      onSubmit={submitSearch}
                    />
                  </div>
                )}
              </>
            ) : null}
            {isHome && <DiscoveryShelf />}
            {route.page === "ask" ? (
              <DemandSearch
                key={route.search}
                search={route.search}
                saved={saved}
                onSave={toggleSave}
                onPreview={previewProject}
                onOpen={openRepo}
                onGitHub={(text) => {
                  setSearchMode("github");
                  submitSearch(text, "github");
                }}
              />
            ) : (
              <section
                ref={browserRef}
                id="project-browser"
                className="project-discovery-section"
                aria-busy={loading}
                aria-label={
                  route.page === "saved" ? "收藏的项目" : "GitHub 项目浏览"
                }
              >
                {route.page === "discover" && (
                  <div className="project-browser-controls">
                    <FilterDisclosure label="用途、语言与排序" iconOnly>
                      <div className="discovery-filter-row">
                        <CategoryFilters
                          active={browseQuery ? null : browseCategory}
                          onChange={selectCategory}
                          onIntent={(id) => preloadCategory(id, language, sort)}
                        />
                        <div className="select-filters">
                          <label>
                            <Code2 size={14} />
                            <select
                              aria-label="按编程语言筛选"
                              value={language}
                              onChange={(event) => {
                                setLanguage(event.target.value);
                              }}
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
                            <ChevronDown size={12} />
                          </label>
                          <label>
                            <SlidersHorizontal size={14} />
                            <select
                              aria-label="项目排序"
                              value={sort}
                              onChange={(event) => {
                                setSort(event.target.value);
                              }}
                            >
                              <option value="stars">最多星标</option>
                              <option value="updated">最近更新</option>
                              <option value="best-match">最相关</option>
                            </select>
                            <ChevronDown size={12} />
                          </label>
                        </div>
                      </div>
                    </FilterDisclosure>
                    <div className="browser-utilities">
                      <details
                        className="browse-coverage"
                        onBlur={(event) => {
                          if (
                            !event.currentTarget.contains(event.relatedTarget)
                          )
                            event.currentTarget.open = false;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape")
                            event.currentTarget.open = false;
                        }}
                      >
                        <summary aria-label="项目信息" title="数据与项目范围">
                          <Info size={16} />
                        </summary>
                        <div className="browse-info-panel">
                          <p>
                            已载入 {displayItems.length} 项 ·{" "}
                            {filterPreview ? "已收录范围匹配" : "匹配"}{" "}
                            {(aiCards.enabled
                              ? aiCards.total || total
                              : total
                            ).toLocaleString("zh-CN")}{" "}
                            项
                          </p>
                          <p>
                            {loading
                              ? "正在连接 GitHub…"
                              : source === "snapshot"
                                ? `离线资料快照 · ${new Date(fetchedAt).toLocaleDateString("zh-CN")}`
                                : source
                                  ? `GitHub ${source === "cache" ? "近期缓存" : "实时数据"} · ${new Date(fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
                                  : "GitHub 公开项目"}
                          </p>
                          <p>
                            分类依据仓库公开标签，不代表 GitHub
                            全量收录。每组查询最多 1,000 项，可用关键词、语言或
                            owner/repo 继续查找。
                          </p>
                          {sourceNote && <p>{sourceNote}</p>}
                          <p>
                            中文介绍依据项目资料整理，可切换作者原文；图片来自
                            README，无图时省略。常用分类的中文介绍已提前准备，服务端持续更新并保存在本机。
                          </p>
                        </div>
                      </details>
                      <button
                        className="icon-btn"
                        aria-label="刷新项目"
                        title="刷新项目"
                        disabled={loading}
                        onClick={() => {
                          setNonce((n) => n + 1);
                        }}
                      >
                        <RefreshCw
                          size={16}
                          className={loading ? "spin" : ""}
                        />
                      </button>
                    </div>
                  </div>
                )}
                {serverManaged && pendingCount > 0 && (
                  <div className="card-generation-progress" role="status">
                    {preparationError ? (
                      <Info size={14} />
                    ) : (
                      <Loader2 size={14} className="spin" />
                    )}
                    <span>
                      {preparationError ||
                        `正在准备这个范围的中文介绍，还剩 ${pendingCount} 项…`}
                    </span>
                    {preparationError && (
                      <button onClick={retrySearch}>重新读取</button>
                    )}
                  </div>
                )}
                {filterPreview && route.page === "discover" && !error && (
                  <div className="card-generation-progress" role="status">
                    {refreshPending ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Info size={14} />
                    )}
                    <span>
                      {preparationError ||
                        (displayItems.length
                          ? "已显示本机收录中符合条件的项目，正在补全结果。"
                          : "本机收录中暂无匹配项目，正在查找更多结果。")}
                    </span>
                    {!refreshPending && (
                      <button onClick={retrySearch}>重新读取</button>
                    )}
                  </div>
                )}
                {refreshPending &&
                  !filterPreview &&
                  !pendingCount &&
                  route.page === "discover" && (
                    <div className="card-generation-progress" role="status">
                      <Loader2 size={14} className="spin" />
                      <span>
                        正在更新这个范围的项目，已显示的内容可以继续浏览。
                      </span>
                    </div>
                  )}
                {aiCards.enabled &&
                  (aiCards.busy || aiCards.error || aiCards.needsRetry) && (
                    <div className="card-generation-progress" role="status">
                      {aiCards.busy ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      <span>{aiCards.error || aiCards.message}</span>
                      {!aiCards.busy && aiCards.needsRetry && (
                        <button onClick={aiCards.retry}>重试未完成卡片</button>
                      )}
                    </div>
                  )}
                {error && (
                  <div className="api-error" role="alert">
                    <Globe2 size={17} />
                    <div>
                      <strong>{error.message}</strong>
                      {error.resetAt && (
                        <span>
                          预计{" "}
                          {new Date(error.resetAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          后可重试。
                        </span>
                      )}
                      {source === "snapshot" && (
                        <span>显示已保存资料。搜索将在连接恢复后可用。</span>
                      )}
                    </div>
                    <button onClick={retrySearch}>
                      重新连接
                      <RefreshCw size={13} />
                    </button>
                  </div>
                )}
                {loading && page === 1 && !displayItems.length ? (
                  <div
                    className="project-grid skeleton-grid"
                    aria-label="项目加载中"
                  >
                    {Array.from({ length: 4 }, (_, i) => (
                      <div className="project-skeleton" key={i}>
                        <div />
                        <i />
                        <i />
                        <i />
                      </div>
                    ))}
                  </div>
                ) : displayItems.length ? (
                  <RepositoryGrid>
                    {displayItems.map((repo) => (
                      <RepositoryCard
                        key={repo.fullName}
                        repo={repo}
                        saved={saved.some((s) => s.fullName === repo.fullName)}
                        onSave={() => toggleSave(repo)}
                        onOpen={() => openRepo(repo)}
                        onPreview={() => {
                          setPreviewCollection(null);
                          setPreviewRepo(repo);
                        }}
                        generating={aiCards.enabled && aiCards.busy}
                        generationError={
                          aiCards.enabled
                            ? aiCards.errors[repo.fullName]
                            : undefined
                        }
                      />
                    ))}
                  </RepositoryGrid>
                ) : (
                  !error &&
                  !pendingCount &&
                  !filterPreview && (
                    <div className="discovery-empty">
                      <Bookmark size={30} />
                      <h3>
                        {route.page === "saved"
                          ? "还没有收藏项目"
                          : "没有找到匹配的项目"}
                      </h3>
                      <p>
                        {route.page === "saved"
                          ? "在项目卡片上点击书签，留着之后看。"
                          : "换个关键词，或调整用途和语言筛选。"}
                      </p>
                      <button
                        className="button primary-button"
                        onClick={() => {
                          setLanguage("");
                          submitSearch("");
                        }}
                      >
                        浏览全部项目
                      </button>
                    </div>
                  )
                )}
                {incomplete && route.page === "discover" && (
                  <p className="result-note">
                    GitHub 返回了部分搜索结果，可以稍后刷新或缩小检索范围。
                  </p>
                )}
                {route.page === "discover" &&
                  !aiCards.enabled &&
                  source !== "snapshot" &&
                  !exhausted &&
                  !error &&
                  page < 84 &&
                  items.length > 0 &&
                  items.length < Math.min(total, 1000) && (
                    <button
                      className="load-more"
                      disabled={
                        loading ||
                        pendingCount > 0 ||
                        (refreshPending && !filterPreview)
                      }
                      onClick={loadMore}
                    >
                      {loading ? (
                        <Loader2 size={15} className="spin" />
                      ) : (
                        <Plus size={16} />
                      )}
                      加载更多项目
                    </button>
                  )}
                {aiCards.enabled && aiCards.hasMore && (
                  <button className="load-more" onClick={aiCards.loadMore}>
                    <Plus size={16} />
                    加载更多项目
                  </button>
                )}
                {aiCards.enabled && aiCards.busy && (
                  <div className="card-generation-next" role="status">
                    <Loader2 size={15} className="spin" />
                    正在准备第 {aiCards.lastPage || 1} 页的中文项目卡…
                  </div>
                )}
                {route.page === "discover" &&
                  total > 1000 &&
                  (displayItems.length >= 1000 ||
                    (aiCards.enabled
                      ? aiCards.lastPage >= 84
                      : page >= 84)) && (
                    <a
                      className="result-note"
                      href={`https://github.com/search?type=repositories&q=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub API 最多返回前 1,000 条结果。缩小条件，或前往
                      GitHub 继续浏览。
                      <ExternalLink size={13} />
                    </a>
                  )}
              </section>
            )}
          </>
        )}
        {route.page !== "ask" && (
          <footer className="observatory-footer">
            <span>
              <Github size={17} />
              开源观测站
            </span>
            <span>从项目内容开始，认识开源。</span>
            <a
              href="https://github.com/explore"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Explore
              <ArrowUpRight size={13} />
            </a>
          </footer>
        )}
      </main>
      {previewRepo && (
        <QuickRead
          repo={previewRepo}
          saved={saved.some((repo) => repo.fullName === previewRepo.fullName)}
          position={Math.max(0, previewIndex)}
          total={quickReadItems.length}
          onClose={() => setPreviewRepo(null)}
          onSave={() => {
            toggleSave(previewRepo);
            if (route.page === "saved")
              setPreviewRepo(
                displayItems.find(
                  (repo) => repo.fullName !== previewRepo.fullName,
                ) || null,
              );
          }}
          onOpen={
            hasProjectTrial(previewRepo.fullName)
              ? () => {
                  openRepo(previewRepo);
                  setPreviewRepo(null);
                }
              : undefined
          }
          onPrevious={
            previewIndex > 0
              ? () => setPreviewRepo(quickReadItems[previewIndex - 1])
              : undefined
          }
          onNext={
            previewIndex >= 0 && previewIndex < quickReadItems.length - 1
              ? () => setPreviewRepo(quickReadItems[previewIndex + 1])
              : undefined
          }
        />
      )}
      {searchOpen && (
        <Dialog title="搜索整个 GitHub" onClose={() => setSearchOpen(false)}>
          <div className="command-heading">
            <Search size={22} />
            <h2>搜索 GitHub 项目</h2>
          </div>
          <form
            className="command-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch(searchText);
            }}
          >
            <label className="command-mode">
              搜索模式
              <select
                aria-label="快捷搜索模式"
                value={searchMode}
                onChange={(event) =>
                  setSearchMode(event.target.value as SearchMode)
                }
              >
                <option value="auto">自动识别</option>
                <option value="github">GitHub 搜索</option>
                <option value="ai">AI 需求搜索</option>
              </select>
            </label>
            <input
              aria-label="全站项目搜索"
              autoFocus
              placeholder="项目名、技术关键词，或 owner/repo"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              maxLength={500}
            />
            <button className="button primary-button" type="submit">
              搜索项目
              <ArrowRight size={15} />
            </button>
          </form>
          <div className="command-suggestions">
            <span>常用搜索</span>
            {["白板", "人工智能", "数据库", "笔记"].map((t) => (
              <button key={t} onClick={() => submitSearch(t)}>
                {t}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
          <p className="command-footnote">Enter 搜索 · Esc 关闭</p>
        </Dialog>
      )}
      {projectOpening && (
        <div className="toast" role="status">
          <Loader2 className="spin" size={16} />
          正在打开项目资料…
          <button
            aria-label="取消打开项目"
            onClick={() => {
              previewRequest.current?.abort();
              setProjectOpening(false);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
