import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Asterisk,
  ChevronDown,
  Info,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import { ApiError } from "../api";
import type { ApiEnvelope } from "../api";
import {
  askProjects,
  conversationPath,
  readConversation,
} from "../observatoryApi";
import type {
  Condition,
  Conversation,
  Override,
  RecommendationData,
} from "../observatoryApi";
import RecommendationReply from "./RecommendationReply";
import type { ReplyActions } from "./RecommendationReply";

function userText(turn: string) {
  // Condition edits travel with the request; the chat displays what the user typed.
  return turn.replace(/^当前编辑条件：[\s\S]*?。/, "");
}

export default function DemandSearch({
  search,
  saved,
  onSave,
  onPreview,
  onOpen,
  onGitHub,
}: ReplyActions & {
  search: string;
  onGitHub: (text: string) => void;
}) {
  // Each external entry mounts a fresh page; only this page owns its dialogue.
  const [conversation, setConversation] = useState<Conversation>(() =>
    readConversation(search),
  );
  const answers = useRef(
    new Map<string, ApiEnvelope<RecommendationData>>(),
  ).current;
  const turnReplies = useRef(
    new Map<string, ApiEnvelope<RecommendationData>>(),
  ).current;
  const key = JSON.stringify(conversation);
  const empty = !conversation.turns.length;
  const project = conversation.repo;
  const turnKey = (turns: string[]) =>
    JSON.stringify({ turns, repo: project || null });
  const [result, setResult] = useState<ApiEnvelope<RecommendationData> | null>(
    () => answers.get(key) || null,
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!empty && !answers.has(key));
  const [status, setStatus] = useState("正在理解你的需求…");
  const [cancelled, setCancelled] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [followup, setFollowup] = useState("");
  const [conditionText, setConditionText] = useState("");
  const [conditionLevel, setConditionLevel] = useState<"must" | "prefer">(
    "must",
  );
  const [showJump, setShowJump] = useState(false);
  const [validation, setValidation] = useState("");
  const abort = useRef<AbortController | null>(null);
  const root = useRef<HTMLElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const currentTurn = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const limit = conversation.turns.length >= 8;

  useEffect(() => {
    // Consume the entry prompt once so refresh/back cannot replay an old dialogue.
    const params = new URLSearchParams(search);
    params.delete("turns");
    params.delete("overrides");
    window.history.replaceState(
      window.history.state,
      "",
      `#/ask${params.size ? `?${params}` : ""}`,
    );
  }, []);

  useEffect(() => {
    if (empty) return;
    if (!nonce && answers.has(key)) {
      setResult(answers.get(key)!);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(null);
    setCancelled(false);
    setResult(null);
    setStatus(project ? "正在阅读项目资料…" : "正在理解你的需求…");
    askProjects(
      conversation,
      controller.signal,
      (message) => {
        if (!controller.signal.aborted) setStatus(message);
      },
      (value) => {
        if (!controller.signal.aborted) setResult(value);
      },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (answers.size >= 40) answers.delete(answers.keys().next().value!);
        if (turnReplies.size >= 40)
          turnReplies.delete(turnReplies.keys().next().value!);
        answers.set(key, value);
        turnReplies.set(turnKey(conversation.turns), value);
        setResult(value);
      })
      .catch((problem) => {
        if (!controller.signal.aborted)
          setError(
            problem instanceof ApiError
              ? problem
              : new ApiError("AI 检索暂时失败，请重试。"),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, nonce]);

  useLayoutEffect(() => {
    if (!composer.current) return;
    const observer = new ResizeObserver(([entry]) => {
      root.current?.style.setProperty(
        "--composer-height",
        `${Math.ceil(entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height)}px`,
      );
    });
    observer.observe(composer.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
  }, [followup]);
  useEffect(() => {
    if (empty) {
      input.current?.focus({ preventScroll: true });
      return;
    }
    const frame = requestAnimationFrame(() => {
      currentTurn.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
      input.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  useEffect(() => {
    if (!bottom.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowJump(!entry.isIntersecting),
      { rootMargin: "0px 0px -200px 0px" },
    );
    observer.observe(bottom.current);
    return () => observer.disconnect();
  }, [result, empty]);

  function changeCondition(condition: Condition, level: Override["level"]) {
    const overrides = [
      ...conversation.overrides.filter((item) => item.id !== condition.id),
      { ...condition, level },
    ];
    setConversation({ ...conversation, overrides });
  }
  function follow(text: string) {
    if (!text.trim() || limit || loading) return;
    const edits = conversation.overrides.map(
      (condition) =>
        `${condition.level === "remove" ? "删除条件" : condition.level === "must" ? "必须" : "偏好"}：${condition.label}`,
    );
    const turn = `${edits.length ? `当前编辑条件：${edits.join("；")}。` : ""}${text.trim()}`;
    if (turn.length > 500) {
      setValidation("追问与当前编辑条件超过 500 字，请缩短。");
      return;
    }
    setConversation({
      turns: [...conversation.turns, turn],
      overrides: [],
      ...(project ? { repo: project } : {}),
    });
    setFollowup("");
  }
  function stop() {
    abort.current?.abort();
    setLoading(false);
    setCancelled(true);
  }
  function jumpToReply() {
    bottom.current?.scrollIntoView({
      block: "end",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  const data = result?.data;
  const actions = { saved, onSave, onPreview, onOpen };
  return (
    <section
      ref={root}
      className={`demand-results chat-workspace ${empty ? "chat-is-empty" : ""}`}
      aria-label={project ? "项目问答" : "自然语言项目推荐"}
    >
      <header className="chat-topbar">
        <div>
          <span className="chat-brand-mark">
            <Asterisk size={22} />
          </span>
          <h1>开源助手</h1>
          <span className="chat-topbar-caption">把想法，变成好用的项目。</span>
        </div>
        <div>
          <a
            className="icon-btn"
            href="#/discover"
            aria-label="返回项目发现"
            title="返回项目发现"
          >
            <ArrowLeft size={17} />
          </a>
          <a
            className="icon-btn"
            href={`#${conversationPath({ turns: [], overrides: [] })}`}
            aria-label="新对话"
            title="新对话"
          >
            <SquarePen size={18} />
          </a>
        </div>
      </header>
      {empty ? (
        <div className="chat-welcome">
          <div className="chat-welcome-mark">
            <Asterisk size={42} strokeWidth={1.4} />
          </div>
          <p className="chat-welcome-english">
            An idea is a good place to start.
          </p>
          <h2>
            {project
              ? `聊聊 ${project.split("/")[1]}`
              : "你想用开源，做点什么？"}
          </h2>
          <p>
            {project
              ? "想了解什么，直接问吧。"
              : "说说你的想法，我来帮你找项目。"}
          </p>
        </div>
      ) : (
        <div className="chat-transcript" aria-label="对话记录">
          {conversation.turns.map((turn, index) => {
            const current = index === conversation.turns.length - 1;
            const previous = !current
              ? turnReplies.get(turnKey(conversation.turns.slice(0, index + 1)))
              : null;
            return (
              <div
                className={`chat-turn ${current ? "chat-current-turn" : "chat-past-turn"}`}
                key={`${index}-${turn}`}
                data-current={current}
                ref={current ? currentTurn : undefined}
              >
                <div className="chat-user-message">
                  <span className="sr-only">你：</span>
                  <p>{userText(turn)}</p>
                </div>
                {(previous || current) && (
                  <div className="chat-assistant-message">
                    <div className="chat-assistant-label">
                      <span
                        className={`chat-assistant-avatar ${current && loading ? "is-working" : ""}`}
                      >
                        <Asterisk size={19} />
                      </span>
                      <span>开源助手</span>
                      {current && loading && (
                        <span className="chat-typing-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                    </div>
                    {previous && (
                      <RecommendationReply result={previous} {...actions} />
                    )}
                    {current && (
                      <>
                        {loading && (
                          <div className="chat-working">
                            <div className="chat-progress" role="status">
                              <span
                                className="chat-progress-orbit"
                                aria-hidden="true"
                              />
                              <span key={status}>{status}</span>
                            </div>
                            {data?.selections.length ? null : project ? (
                              <div
                                className="chat-project-loading"
                                aria-hidden="true"
                              >
                                <i />
                                <i />
                                <i />
                              </div>
                            ) : (
                              <div
                                className="chat-loading-cards"
                                aria-hidden="true"
                              >
                                {[0, 1].map((i) => (
                                  <div className="chat-loading-card" key={i}>
                                    <span />
                                    <i />
                                    <i />
                                    <i />
                                    <div />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {(error || cancelled) && (
                          <div className="demand-error" role="alert">
                            <Info size={19} />
                            <div>
                              <h2>
                                {cancelled
                                  ? project
                                    ? "已停止回答"
                                    : "已取消本次检索"
                                  : error?.status === 503
                                    ? "AI 搜索尚未配置"
                                    : project
                                      ? "这次未能完成回答"
                                      : "这次未能完成检索"}
                              </h2>
                              <p>
                                {cancelled
                                  ? "修改一下需求，或者再试一次。"
                                  : error?.message}
                              </p>
                              <div className="inline-actions">
                                <button
                                  className="button outline-button"
                                  onClick={() => setNonce((n) => n + 1)}
                                >
                                  <RefreshCw size={14} />
                                  重试
                                </button>
                                <button
                                  className="button outline-button"
                                  onClick={() =>
                                    onGitHub(conversation.turns[0] || "")
                                  }
                                >
                                  <Search size={14} />
                                  改用 GitHub 搜索
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {data && (!error || data.partial) && (
                          <>
                            <RecommendationReply
                              result={result!}
                              pending={loading}
                              {...actions}
                              onRetry={
                                !loading && !cancelled
                                  ? () => setNonce((n) => n + 1)
                                  : undefined
                              }
                            />
                            {!project && !loading && !error && !cancelled && (
                              <details
                                className="chat-condition-editor"
                                open={
                                  conversation.overrides.length > 0 || undefined
                                }
                              >
                                <summary>
                                  <SlidersHorizontal size={14} />
                                  调整需求
                                  <ChevronDown size={13} />
                                </summary>
                                <div className="chat-condition-content">
                                  <p>
                                    切换必须 / 偏好，或补充条件，我会重新查找。
                                  </p>
                                  <div className="requirement-chips">
                                    {data.plan.constraints.map((condition) => (
                                      <span
                                        className={`requirement-chip ${condition.level}`}
                                        key={condition.id}
                                      >
                                        <button
                                          aria-label={`${condition.label}：${condition.level === "must" ? "必须，改为偏好" : "偏好，改为必须"}`}
                                          onClick={() =>
                                            changeCondition(
                                              condition,
                                              condition.level === "must"
                                                ? "prefer"
                                                : "must",
                                            )
                                          }
                                        >
                                          {condition.level === "must"
                                            ? "必须"
                                            : "偏好"}
                                        </button>
                                        <span>{condition.label}</span>
                                        <button
                                          aria-label={`删除条件 ${condition.label}`}
                                          onClick={() =>
                                            changeCondition(condition, "remove")
                                          }
                                        >
                                          <X size={13} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <form
                                    className="add-condition"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      if (conditionText.trim())
                                        changeCondition(
                                          {
                                            id: `custom_${Date.now().toString(36)}`,
                                            label: conditionText.trim(),
                                            level: conditionLevel,
                                          },
                                          conditionLevel,
                                        );
                                    }}
                                  >
                                    <input
                                      aria-label="补充筛选条件"
                                      placeholder="补充条件，例如：不需要 GPU"
                                      maxLength={100}
                                      value={conditionText}
                                      onChange={(event) =>
                                        setConditionText(event.target.value)
                                      }
                                    />
                                    <select
                                      aria-label="补充条件级别"
                                      value={conditionLevel}
                                      onChange={(event) =>
                                        setConditionLevel(
                                          event.target.value as
                                            "must" | "prefer",
                                        )
                                      }
                                    >
                                      <option value="must">必须</option>
                                      <option value="prefer">偏好</option>
                                    </select>
                                    <button
                                      className="icon-btn"
                                      aria-label="添加条件"
                                      disabled={!conditionText.trim()}
                                    >
                                      <Plus size={17} />
                                    </button>
                                  </form>
                                </div>
                              </details>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div ref={bottom} className="chat-bottom-anchor" />
      <div ref={composer} className="chat-composer-dock">
        {!empty && showJump && (
          <button
            className="chat-jump"
            aria-label="滚动到最新回复"
            title="最新回复"
            onClick={jumpToReply}
          >
            <ArrowDown size={17} />
          </button>
        )}
        <form
          className="followup-form chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            follow(followup);
          }}
        >
          <label className="sr-only" htmlFor="followup-input">
            {empty ? "描述你的需求" : "继续对话"}
          </label>
          {project && (
            <div className="chat-project-context">
              <MessageCircle size={13} />
              <span title={project}>{project}</span>
              <a
                href={`#${conversationPath({ turns: [], overrides: [] })}`}
                aria-label="移除项目上下文"
                title="移除项目"
              >
                <X size={12} />
              </a>
            </div>
          )}
          <div className="chat-composer-row">
            <textarea
              ref={input}
              id="followup-input"
              rows={1}
              placeholder={
                limit
                  ? "已聊满 8 轮，请开启新对话"
                  : project
                    ? "问问这个项目…"
                    : empty
                      ? "说说你想做什么…"
                      : "继续聊聊…"
              }
              maxLength={500}
              value={followup}
              disabled={limit}
              onChange={(event) => {
                setFollowup(event.target.value);
                setValidation("");
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  follow(followup);
                }
              }}
            />
            {loading ? (
              <button
                type="button"
                className="chat-send is-stop"
                aria-label="取消"
                title="停止生成"
                onClick={stop}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="chat-send"
                aria-label="发送需求"
                title="发送需求"
                disabled={!followup.trim() || limit}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
        </form>
        {validation && (
          <p className="chat-composer-error" role="alert">
            {validation}
          </p>
        )}
      </div>
    </section>
  );
}
