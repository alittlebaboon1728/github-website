import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { trialDocument, trialRequest } from "../trials";
import type { Trial, TrialStatus } from "../trials";
import { useTrialStatus } from "../useTrialCatalog";
import { dateLabel } from "../observatoryApi";
import GlassButton from "./GlassButton";
import { projectTrialSections } from "../projectTrialSections";
import ProjectTrialReading from "./ProjectTrialReading";
import ProjectTrialSteps from "./ProjectTrialSteps";

function Experience({ trial, dark }: { trial: Trial; dark: boolean }) {
  const [revision, setRevision] = useState(0),
    [node, setNode] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null),
    resizeToken = useId();
  const [height, setHeight] = useState(580);
  const frameVersion = `${trial.generatedAt}:${revision}:${dark}`;
  const [loadedVersion, setLoadedVersion] = useState("");
  const experience = trial.experience;
  const [document, setDocument] = useState("");
  useEffect(() => {
    // Read shared tokens after the host has applied its new theme.
    let current = true;
    queueMicrotask(() => {
      if (current)
        setDocument(
          experience.html
            ? trialDocument(experience.html, dark, resizeToken)
            : "",
        );
    });
    return () => {
      current = false;
    };
  }, [experience.html, dark, resizeToken]);
  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "trial-height" ||
        event.data.token !== resizeToken ||
        !Number.isFinite(event.data.height)
      )
        return;
      setHeight(Math.max(380, Math.min(1800, event.data.height)));
    };
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, [resizeToken]);
  return (
    <section className="trial-experience" aria-label="项目试用体验">
      <div className="trial-experience-bar">
        <span>
          {experience.kind === "interactive" ? (
            <FlaskConical size={16} />
          ) : experience.kind === "flow" ? (
            <GitBranch size={16} />
          ) : (
            <Play size={16} />
          )}
          <strong>{experience.title}</strong>
        </span>
        {experience.kind === "interactive" && (
          <button
            className="icon-btn"
            aria-label="重置教学演示"
            onClick={() => setRevision((n) => n + 1)}
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>
      <p className="trial-experience-description">{experience.description}</p>
      {experience.kind === "interactive" ? (
        <>
          <div className="trial-sandbox-label">
            AI 交互教学示例 · 使用示例数据，不是项目原版软件
          </div>
          <div className="trial-frame-host" style={{ minHeight: height }}>
            {loadedVersion !== frameVersion && (
              <div className="trial-sandbox-loading" role="status">
                <Loader2 className="spin" size={20} />
                正在打开教学演示…
              </div>
            )}
            {document && (
              <iframe
                ref={frame}
                key={revision}
                style={{
                  height,
                  visibility:
                    loadedVersion === frameVersion ? "visible" : "hidden",
                }}
                className="trial-sandbox"
                title={`${trial.name} 交互教学示例`}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={document}
                onLoad={() =>
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => setLoadedVersion(frameVersion)),
                  )
                }
              />
            )}
          </div>
        </>
      ) : experience.kind === "flow" ? (
        <div className="trial-flow">
          <div className="trial-flow-nodes" role="group" aria-label="使用流程">
            {experience.nodes?.map((item, index) => (
              <button
                key={index}
                aria-pressed={node === index}
                onClick={() => setNode(index)}
              >
                <span>{index + 1}</span>
                {item.title}
                {index < (experience.nodes?.length || 0) - 1 && (
                  <ArrowRight size={16} />
                )}
              </button>
            ))}
          </div>
          <div className="trial-flow-detail" aria-live="polite">
            <GitBranch size={30} />
            <h3>{experience.nodes?.[node]?.title}</h3>
            <p>{experience.nodes?.[node]?.detail}</p>
          </div>
          <p className="trial-fine-print">
            根据项目资料整理的使用流程，点击节点查看细节。
          </p>
        </div>
      ) : (
        <div className="trial-external">
          <span>
            {experience.kind === "video" ? (
              <Play size={40} />
            ) : (
              <ExternalLink size={40} />
            )}
          </span>
          <h3>
            {experience.kind === "video"
              ? "跟着项目视频看一遍"
              : "到项目提供的页面亲手试试"}
          </h3>
          <p>
            在独立页面打开，回来后可以继续下面的上手步骤。访问条件以对方页面为准。
          </p>
          <a
            className="button primary-button"
            href={experience.url}
            target="_blank"
            rel="noreferrer"
          >
            {experience.kind === "video" ? "打开项目视频" : "打开在线体验"}
            <ArrowUpRight size={16} />
          </a>
        </div>
      )}
    </section>
  );
}

function TrialPractice({ trial, dark }: { trial: Trial; dark: boolean }) {
  const [opened, setOpened] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const local = ["interactive", "flow"].includes(trial.experience.kind);
  const label =
    trial.experience.kind === "interactive" ? "打开交互体验" : "查看使用流程";
  function open() {
    setOpened(true);
    requestAnimationFrame(() => {
      workspace.current?.focus({ preventScroll: true });
      workspace.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
  }
  return (
    <section
      className="reader-practice"
      id="trial-hands-on"
      aria-labelledby="trial-practice-title"
    >
      <div className="reader-practice-heading">
        <div>
          <h2 id="trial-practice-title">{projectTrialSections.experience}</h2>
          <p>{trial.goal}</p>
        </div>
        <div className="reader-practice-actions">
          <span>
            <Clock3 size={14} /> {trial.duration}
          </span>
          {local && (
            <GlassButton
              variant="primary"
              data-action="open-trial"
              onClick={open}
            >
              <FlaskConical size={16} />
              {opened ? "继续体验" : label}
            </GlassButton>
          )}
        </div>
      </div>
      <ProjectTrialSteps steps={trial.steps} />
      {!local || opened ? (
        <div
          ref={workspace}
          tabIndex={-1}
          className="trial-workspace trial-workspace--reading"
        >
          <Experience trial={trial} dark={dark} />
        </div>
      ) : (
        <div className="trial-experience-preview">
          <p>{trial.experience.description}</p>
          <span>点击“{label}”，即可在这里开始。</span>
        </div>
      )}
    </section>
  );
}

function Command({ value }: { value: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="trial-command">
      <pre>
        <code>{value}</code>
      </pre>
      <button
        className="icon-btn"
        aria-label="复制使用命令"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage("已复制");
          } catch {
            setMessage("请选中命令手动复制");
          }
        }}
      >
        <Copy size={16} />
      </button>
      {message && <span role="status">{message}</span>}
    </div>
  );
}

export default function TrialPage({
  fullName,
  dark,
}: {
  fullName: string;
  dark: boolean;
}) {
  const { status, error: readError, retry } = useTrialStatus(fullName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function generate() {
    setSubmitting(true);
    setError("");
    setConfirm(false);
    try {
      await trialRequest<TrialStatus>(fullName, undefined, {
        regenerate: Boolean(status?.trial),
      });
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "生成请求失败，请重试。",
      );
    } finally {
      setSubmitting(false);
    }
  }
  const trial = status?.trial,
    running = status?.job?.state === "running";
  return (
    <article className="trial-page readable-project">
      <div className="trial-topline">
        <a href="#/stories">
          <ArrowLeft size={16} />
          项目试用
        </a>
        <a
          href={`https://github.com/${fullName}`}
          target="_blank"
          rel="noreferrer"
        >
          {fullName}
          <ArrowUpRight size={14} />
        </a>
      </div>
      {(error || readError) && (
        <div className="trial-error" role="alert">
          {error || readError}
          <button
            onClick={() => {
              setError("");
              retry();
            }}
          >
            重新读取
          </button>
        </div>
      )}
      {status?.job?.state === "error" && (
        <div className="trial-error" role="alert">
          {status.job.error}
          <button disabled={submitting} onClick={() => void generate()}>
            重试生成
          </button>
        </div>
      )}
      {running && (
        <div className="trial-generating" role="status">
          <Loader2 className="spin" size={22} />
          <div>
            <strong>{status.job?.stage}</strong>
            <p>
              正在为 {fullName.split("/")[1]}{" "}
              准备专属体验。离开后仍会继续，可在项目试用中查看。
            </p>
          </div>
          <a href="#/stories">
            稍后查看
            <ArrowRight size={15} />
          </a>
        </div>
      )}
      {!status && !error && !readError && (
        <div className="trial-empty">
          <Loader2 className="spin" />
          <p>正在读取项目试用…</p>
        </div>
      )}
      {status && !trial && (
        <section className="trial-preparation">
          <div className="trial-preparation-symbol">
            <FlaskConical size={52} strokeWidth={1.3} />
          </div>
          <h1>{fullName.split("/")[1]}</h1>
          <p>从“知道它是什么”，到“亲手试过一次”。</p>
          <div className="trial-preparation-plan">
            <span>
              <BookOpen size={22} />
              读懂用途
            </span>
            <ArrowRight size={16} />
            <span>
              <FlaskConical size={22} />
              完成小练习
            </span>
            <ArrowRight size={16} />
            <span>
              <Code2 size={22} />
              开始正式使用
            </span>
          </div>
          <p className="trial-preparation-detail">
            根据项目 README，AI
            会选择适合的交互、流程或在线体验，并整理使用说明与必要前提。
          </p>
          {!running && (
            <button
              className="button primary-button"
              disabled={submitting || !status.configured}
              onClick={() => void generate()}
            >
              {submitting ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              生成项目试用
            </button>
          )}
          {!status.configured && (
            <p>试用生成服务尚未配置，已有体验仍可使用。</p>
          )}
        </section>
      )}
      {trial && (
        <>
          <header className="reader-header">
            <div>
              <h1>{trial.name}</h1>
              <p>{trial.summary}</p>
            </div>
          </header>
          <div className="reader-overview">
            <ProjectTrialReading
              introduction={trial.reading?.introduction || trial.summary}
              usage={
                trial.reading?.usage ||
                trial.guide.map((item) => item.body).join(" ")
              }
              sourceUrl={trial.sourceUrl}
            />
            <aside className="reader-start trial-reader-start">
              <BookOpen size={24} strokeWidth={1.5} />
              <h2>开始之前</h2>
              <p>
                <strong>适合谁</strong>
                {trial.audience}
              </p>
              {trial.prerequisites.length > 0 && (
                <div>
                  <strong>需要准备</strong>
                  <ul>
                    {trial.prerequisites.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="reader-start-links">
                <a href={trial.sourceUrl} target="_blank" rel="noreferrer">
                  阅读项目原文
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </aside>
          </div>
          <TrialPractice
            trial={trial}
            dark={dark}
            key={`${trial.repo}:${trial.generatedAt}`}
          />
          <section className="trial-aftercare">
            <div className="trial-guide">
              <h2>{projectTrialSections.start}</h2>
              <p>完成示例后，把同样的方法带到项目中。</p>
              {trial.guide.map((item, i) => (
                <div className="trial-guide-step" key={i}>
                  <span>{i + 1}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                    {item.command && <Command value={item.command} />}
                  </div>
                </div>
              ))}
            </div>
            <aside className="trial-next">
              <h3>{projectTrialSections.links}</h3>
              {trial.links.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noreferrer">
                  <span>
                    {link.kind === "video" ? (
                      <Play size={17} />
                    ) : (
                      <BookOpen size={17} />
                    )}
                    {link.label}
                  </span>
                  <ArrowUpRight size={16} />
                </a>
              ))}
              <div className="trial-boundaries">
                <h3>{projectTrialSections.limitations}</h3>
                <ul>
                  {trial.limitations.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </section>
          <footer className="trial-provenance">
            <details>
              <summary>
                <BookOpen size={15} />
                资料来源与生成说明
              </summary>
              <p>
                由 {trial.model} 根据项目 README 整理，生成于{" "}
                {dateLabel(trial.generatedAt, true)}。资料获取于{" "}
                {dateLabel(trial.sourceAt, true)}
                。教学示例帮助理解流程，不代表项目已经在本站部署或经过完整实测。
              </p>
              <a href={trial.sourceUrl} target="_blank" rel="noreferrer">
                核对项目原文
                <ArrowUpRight size={13} />
              </a>
              {trial.evidence.map((quote, i) => (
                <blockquote key={i}>{quote}</blockquote>
              ))}
            </details>
            <button
              className="text-action"
              disabled={running || submitting || !status.configured}
              onClick={() => setConfirm(!confirm)}
            >
              <RotateCcw size={15} />
              重新生成
            </button>
          </footer>
          {confirm && (
            <div className="trial-regenerate-confirm">
              <p>
                重新读取项目资料并生成新体验，将使用模型额度。成功后替换当前版本。
              </p>
              <button
                className="button outline-button"
                onClick={() => setConfirm(false)}
              >
                保留当前版本
              </button>
              <button
                className="button primary-button"
                onClick={() => void generate()}
              >
                确认重新生成
              </button>
            </div>
          )}
        </>
      )}
      {status?.persistence === false && (
        <p className="trial-fine-print">
          当前未启用持久保存，服务重启后需重新生成。
        </p>
      )}
    </article>
  );
}
