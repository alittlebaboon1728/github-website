import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Copy,
  Database,
  HardDrive,
  Loader2,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Sun,
  Terminal,
} from "lucide-react";
import categories from "../../shared/discovery-categories.json";
import { useLiquidRefraction } from "../useLiquidRefraction";
import { adminRequest } from "./api";
import type { Scope, Snapshot } from "./api";

const number = (value: number) => value.toLocaleString("zh-CN");
const date = (value: number | string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "尚未更新";
function bytes(value: number) {
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return value < 1024 ** 3
    ? `${(value / 1024 ** 2).toFixed(1)} MB`
    : `${(value / 1024 ** 3).toFixed(2)} GB`;
}
function uptime(value: number) {
  const minutes = Math.floor(value / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
    : `${minutes} 分钟`;
}
function scopeName(q: string) {
  return (
    categories.find((category) => category.query === q)?.name ||
    (q === "archived:false stars:>1000" ? "默认星标榜单" : q)
  );
}
const sorts: Record<string, string> = {
  stars: "最多星标",
  updated: "最近更新",
  "best-match": "最相关",
};
const ready = (scope: Scope) =>
  scope.prepared.filter((page) => page.complete || page.end).length;
const hasErrors = (scope: Scope) => scope.prepared.some((page) => page.error);

export default function AdminApp() {
  useLiquidRefraction();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [filter, setFilter] = useState("");
  const [attention, setAttention] = useState(false);
  const [dark, setDark] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("gh-design-dark") || "false") === true
      );
    } catch {
      return false;
    }
  });
  const mounted = useRef(false);
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const data = snapshot?.data;
  const load = useCallback(async () => {
    if (reading.current || writing.current) return;
    const controller = new AbortController();
    reading.current = controller;
    const timer = setTimeout(() => controller.abort(), 12_000);
    setLoading(true);
    try {
      const value = await adminRequest<Snapshot>("status", controller.signal);
      if (mounted.current && reading.current === controller) {
        setSnapshot(value);
        setError("");
      }
    } catch (problem) {
      if (mounted.current && reading.current === controller)
        setError(problem instanceof Error ? problem.message : "状态读取失败。");
    } finally {
      clearTimeout(timer);
      if (reading.current === controller) {
        reading.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      reading.current?.abort();
      reading.current = null;
      writing.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [automatic, load]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("gh-design-dark", JSON.stringify(dark));
    } catch {
      /* Theme remains usable without browser persistence. */
    }
  }, [dark]);
  async function operate(kind: "pause" | "resume" | "refresh", scope?: Scope) {
    if (!data || writing.current) return;
    reading.current?.abort();
    reading.current = null;
    setLoading(false);
    const controller = new AbortController();
    writing.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);
    setAction(scope ? `${scope.q}|${scope.sort}` : kind);
    setNotice("");
    setError("");
    let failure = "";
    try {
      const response = await adminRequest<{
        data: {
          queued?: number;
          deferred?: number;
          running?: boolean;
          finishingCurrent?: boolean;
        };
      }>(
        "library",
        controller.signal,
        {
          action: kind,
          ...(scope ? { scope: { q: scope.q, sort: scope.sort } } : {}),
        },
        data.token,
      );
      if (!mounted.current) return;
      if (kind === "pause")
        setNotice(
          response.data.finishingCurrent
            ? "已暂停后续更新，当前页完成后停止。已缓存项目可正常浏览。"
            : "后台更新已暂停，已缓存项目可正常浏览。重启网站后自动恢复。",
        );
      else if (kind === "resume") setNotice("后台更新已恢复。");
      else
        setNotice(
          `已安排 ${response.data.queued || 0} 页更新${response.data.deferred ? `，${response.data.deferred} 页将在冷却结束后重试` : ""}。${response.data.running ? "" : "恢复后台更新后开始处理。"}`,
        );
    } catch (problem) {
      failure = problem instanceof Error ? problem.message : "操作失败。";
    } finally {
      clearTimeout(timer);
      writing.current = null;
      if (mounted.current) {
        setAction("");
        await load();
        if (failure && mounted.current) setError(failure);
      }
    }
  }
  const scopes = data?.library.scopes || [];
  const allPages = scopes.flatMap((scope) => scope.prepared);
  const completePages = allPages.filter(
    (page) => page.complete || page.end,
  ).length;
  const visibleScopes = scopes.filter(
    (scope) =>
      (!attention || hasErrors(scope) || ready(scope) < scope.pages) &&
      `${scopeName(scope.q)} ${scope.q}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const blocked = loading || Boolean(action) || !data?.library.enabled;
  const stateLabel = !data
    ? "等待连接"
    : !data.library.enabled
      ? "后台更新未开启"
      : data.library.running
        ? "后台运行中"
        : data.library.current
          ? "暂停中，完成当前页"
          : "后台已暂停";
  async function copyCommand(command: string) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(command);
      setNotice(`已复制：${command}`);
    } catch {
      setNotice(`请手动复制：${command}`);
    }
  }
  return (
    <div className="observatory-shell discovery-edition admin-shell">
      <a className="admin-skip" href="#admin-main">
        跳到后台内容
      </a>
      <header className="admin-header">
        <a className="admin-brand" href="/admin">
          <span className="admin-brand-icon">
            <Settings2 size={21} aria-hidden="true" />
          </span>
          <span>
            开源观测站 <small>管理后台</small>
          </span>
        </a>
        <div className="admin-header-actions">
          <a href="/" className="button" target="_blank" rel="noreferrer">
            打开网站
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <button
            className="admin-icon icon-btn"
            aria-label={dark ? "切换浅色主题" : "切换深色主题"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <main id="admin-main">
        <div className="admin-heading">
          <div>
            <h1>网站运行与缓存</h1>
            <p>查看本机服务，管理中文项目库的后台更新。</p>
          </div>
          <div
            className={`admin-state ${data?.library.running ? "running" : ""}`}
          >
            <span aria-hidden="true" />
            {stateLabel}
          </div>
        </div>
        <div className="admin-toolbar">
          <span className="admin-updated">
            {snapshot
              ? `最近读取 ${date(snapshot.fetchedAt)}`
              : "正在连接本机服务…"}
          </span>
          <div>
            <label className="admin-auto">
              <input
                type="checkbox"
                checked={automatic}
                onChange={(event) => setAutomatic(event.target.checked)}
              />
              每 5 秒自动读取
            </label>
            <button
              className="button"
              disabled={loading || Boolean(action)}
              onClick={() => void load()}
            >
              <RefreshCw
                size={15}
                className={loading ? "admin-spin" : ""}
                aria-hidden="true"
              />
              重新读取
            </button>
          </div>
        </div>
        {error && (
          <div className="admin-feedback error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>
              {error}
              {snapshot ? " 当前保留上一次读取的数据。" : ""}
            </span>
          </div>
        )}
        {notice && (
          <div className="admin-feedback" role="status">
            <Check size={18} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
        {!data && !error && (
          <div className="admin-loading" role="status">
            <Loader2 className="admin-spin" size={20} />
            正在读取缓存与服务状态…
          </div>
        )}
        {data && (
          <>
            <section className="admin-metrics" aria-label="运行概览">
              <div>
                <span>
                  <Database size={15} aria-hidden="true" />
                  已保存中文概括
                </span>
                <strong>
                  {number(data.storage.cards)}
                  <small>份</small>
                </strong>
                <p>长期保存在本机</p>
              </div>
              <div>
                <span>
                  <Check size={15} aria-hidden="true" />
                  已准备页面
                </span>
                <strong>
                  {number(completePages)}
                  <small>/ {number(allPages.length)} 页</small>
                </strong>
                <p>{number(scopes.length)} 个分类或筛选范围</p>
              </div>
              <div>
                <span>
                  <HardDrive size={15} aria-hidden="true" />
                  磁盘缓存
                </span>
                <strong>{bytes(data.storage.bytes)}</strong>
                <p>{number(data.storage.files)} 个数据文件</p>
              </div>
              <div>
                <span>
                  <Server size={15} aria-hidden="true" />
                  本次运行
                </span>
                <strong>{uptime(data.server.uptime)}</strong>
                <p>内存 {bytes(data.server.memoryBytes)}</p>
              </div>
            </section>
            <div className="admin-workspace">
              <section
                className="admin-library admin-panel"
                aria-labelledby="library-heading"
              >
                <div className="admin-section-heading">
                  <div>
                    <h2 id="library-heading">分类与预热进度</h2>
                    <p>更新期间继续提供最后一次完整的中文页面。</p>
                  </div>
                  <button
                    className="button"
                    disabled={blocked}
                    onClick={() => void operate("refresh")}
                  >
                    <RefreshCw
                      size={15}
                      className={action === "refresh" ? "admin-spin" : ""}
                      aria-hidden="true"
                    />
                    更新全部范围
                  </button>
                </div>
                <div className="admin-filter">
                  <label className="admin-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      aria-label="查找分类或关键词"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="查找分类或关键词"
                      type="search"
                    />
                  </label>
                  <label className="admin-auto">
                    <input
                      type="checkbox"
                      checked={attention}
                      onChange={(event) => setAttention(event.target.checked)}
                    />
                    仅看未完成或异常
                  </label>
                </div>
                <div
                  className="admin-table"
                  role="table"
                  aria-label="分类预热进度"
                >
                  <div className="admin-table-head" role="row">
                    <span role="columnheader">范围</span>
                    <span role="columnheader">页面进度</span>
                    <span role="columnheader">中文卡</span>
                    <span role="columnheader">操作</span>
                  </div>
                  {visibleScopes.map((scope) => {
                    const complete = ready(scope);
                    const busy =
                      data.library.current?.q === scope.q &&
                      data.library.current.sort === scope.sort;
                    const updated = Math.max(
                      0,
                      ...scope.prepared.map((page) => page.updatedAt || 0),
                    );
                    const problem = scope.prepared.find((page) => page.error);
                    const key = `${scope.q}|${scope.sort}`;
                    return (
                      <div className="admin-scope" role="row" key={key}>
                        <div role="cell" className="admin-scope-name">
                          <strong title={scope.q}>{scopeName(scope.q)}</strong>
                          <small>
                            {sorts[scope.sort] || scope.sort}
                            {scope.defaultScope ? " · 默认范围" : ""}
                          </small>
                          <span
                            className={
                              problem ? "admin-problem" : "admin-row-status"
                            }
                          >
                            {busy
                              ? `第 ${data.library.current!.page} 页 · ${data.library.current!.stage}`
                              : problem
                                ? problem.error
                                : complete === scope.pages
                                  ? `最近更新 ${date(updated)}`
                                  : "等待后台补齐"}
                          </span>
                        </div>
                        <div role="cell" className="admin-page-progress">
                          <span>
                            {complete} / {scope.pages} 页
                          </span>
                          <div className="admin-segments" aria-hidden="true">
                            {scope.prepared.map((page) => (
                              <i
                                key={page.page}
                                className={
                                  page.complete || page.end
                                    ? "ready"
                                    : page.error
                                      ? "failed"
                                      : ""
                                }
                              />
                            ))}
                          </div>
                          <details>
                            <summary>页面详情</summary>
                            <ul>
                              {scope.prepared.map((page) => (
                                <li key={page.page}>
                                  <span>
                                    第 {page.page} 页：
                                    {page.end
                                      ? "已到列表末尾"
                                      : page.complete
                                        ? `${page.ready} 张已就绪`
                                        : page.pending === null
                                          ? "等待准备"
                                          : `${page.ready} 张就绪，${page.pending} 张待补齐`}
                                  </span>
                                  <small>
                                    {page.error
                                      ? `${page.error} 下次重试 ${date(page.nextAt)}`
                                      : date(page.updatedAt)}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </div>
                        <div role="cell" className="admin-card-count">
                          <span className="admin-mobile-label">中文卡 </span>
                          {number(
                            scope.prepared.reduce(
                              (sum, page) => sum + page.ready,
                              0,
                            ),
                          )}
                        </div>
                        <div role="cell" className="admin-scope-action">
                          <button
                            className="button"
                            disabled={blocked}
                            aria-label={`更新${scopeName(scope.q)}`}
                            onClick={() => void operate("refresh", scope)}
                          >
                            <RefreshCw
                              size={14}
                              className={action === key ? "admin-spin" : ""}
                              aria-hidden="true"
                            />
                            更新
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleScopes.length && (
                    <p className="admin-empty">
                      {scopes.length
                        ? "没有符合条件的范围，试试其他关键词。"
                        : "还没有登记的范围。开启后台更新后会准备默认分类。"}
                    </p>
                  )}
                </div>
              </section>
              <aside className="admin-sidebar">
                <section className="admin-panel admin-worker">
                  <h2>后台更新</h2>
                  <p className="admin-worker-state">{stateLabel}</p>
                  <p>
                    {data.library.current
                      ? `${scopeName(data.library.current.q)}，第 ${data.library.current.page} 页，${data.library.current.stage}。`
                      : data.library.running
                        ? "等待下一次检查，有缺失内容时自动补齐。"
                        : "已保存的中文卡和页面仍可读取。"}
                  </p>
                  <button
                    className="button admin-worker-button"
                    disabled={blocked}
                    onClick={() =>
                      void operate(data.library.running ? "pause" : "resume")
                    }
                  >
                    {action === "pause" || action === "resume" ? (
                      <Loader2 size={16} className="admin-spin" />
                    ) : data.library.running ? (
                      <Pause size={16} aria-hidden="true" />
                    ) : (
                      <Play size={16} aria-hidden="true" />
                    )}
                    {data.library.running ? "暂停后台更新" : "恢复后台更新"}
                  </button>
                  <small>
                    每 {Math.round(data.library.refreshMs / 60_000)}{" "}
                    分钟检查。暂停会完成当前页；重启网站后自动恢复。
                  </small>
                </section>
                <section className="admin-panel admin-service">
                  <h2>服务与存储</h2>
                  <dl>
                    <div>
                      <dt>中文模型</dt>
                      <dd>
                        {data.models.cards.configured
                          ? data.models.cards.name
                          : "未配置"}
                      </dd>
                    </div>
                    <div>
                      <dt>试用模型</dt>
                      <dd>
                        {data.models.trials.configured
                          ? data.models.trials.name
                          : "未配置"}
                      </dd>
                    </div>
                    <div>
                      <dt>已保存试用</dt>
                      <dd>{data.storage.trials} 个</dd>
                    </div>
                    <div>
                      <dt>磁盘持久化</dt>
                      <dd>{data.storage.enabled ? "已开启" : "未开启"}</dd>
                    </div>
                    <div>
                      <dt>图片缓存</dt>
                      <dd>{number(data.storage.images || 0)} 张 · {bytes(data.storage.imageBytes || 0)}</dd>
                    </div>
                    <div>
                      <dt>启动时间</dt>
                      <dd>{date(data.server.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>运行环境</dt>
                      <dd>Node {data.server.node}</dd>
                    </div>
                  </dl>
                  <details>
                    <summary>查看数据目录</summary>
                    <code className="admin-path">{data.storage.directory}</code>
                    <p>迁移网站时保留整个目录即可复用缓存与试用。</p>
                  </details>
                </section>
              </aside>
            </div>
          </>
        )}
        <section
          className="admin-commands admin-panel"
          aria-labelledby="commands-heading"
        >
          <div>
            <Terminal size={20} aria-hidden="true" />
            <h2 id="commands-heading">运行命令</h2>
            <p>在 G:\github_website 打开 PowerShell。</p>
          </div>
          <div className="admin-command-list">
            {[
              ["启动网站", "npm run lan:start"],
              ["查看状态", "npm run lan:status"],
              ["停止网站", "npm run lan:stop"],
            ].map(([label, command]) => (
              <div key={command}>
                <span>{label}</span>
                <code>{command}</code>
                <button
                  className="icon-btn admin-copy"
                  aria-label={`复制${label}命令`}
                  onClick={() => void copyCommand(command)}
                >
                  <Copy size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
        <footer className="admin-footer">
          <span>管理后台仅在服务器本机开放。</span>
          <span>
            {snapshot
              ? `进程 ${data?.server.pid} · ${automatic ? "数据每 5 秒读取" : "自动读取已暂停"}`
              : "服务停止后，请通过命令启动。"}
          </span>
        </footer>
      </main>
    </div>
  );
}
