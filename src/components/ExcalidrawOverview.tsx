import { Component, lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Loader2, PenTool } from "lucide-react";
import { excalidrawGuide } from "../excalidrawGuide";
import { projectTrialSections } from "../projectTrialSections";
import GlassButton from "./GlassButton";
import ProjectTrialReading from "./ProjectTrialReading";
import ProjectTrialSteps from "./ProjectTrialSteps";

const ExcalidrawLab = lazy(() => import("../ExcalidrawLab"));

class EditorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="reader-editor-loading" role="alert">
        <h3>白板暂时没有加载成功</h3>
        <p>可以刷新页面重试，或直接到官网画图。</p>
        <a
          className="button primary-button"
          href="https://excalidraw.com"
          target="_blank"
          rel="noreferrer"
        >
          打开官网白板 <ArrowUpRight size={16} />
        </a>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function ExcalidrawOverview({
  dark,
  labOpen,
  onTry,
  onNotify,
}: {
  dark: boolean;
  labOpen: boolean;
  onTry: () => void;
  onNotify: (message: string) => void;
}) {
  return (
    <>
      <div className="reader-overview">
        <ProjectTrialReading
          introduction={excalidrawGuide.paragraphs[0].body}
          usage={excalidrawGuide.paragraphs[1].body}
          sourceUrl="https://github.com/excalidraw/excalidraw#readme"
        />
        <aside className="reader-start" aria-label="开始使用">
          <PenTool size={24} strokeWidth={1.5} />
          <h2>选择适合的使用方式</h2>
          <p>在本站练习单人绘图；需要多人协作或更多功能时，可以前往官网。</p>
          <div className="reader-start-links">
            <a href="https://excalidraw.com" target="_blank" rel="noreferrer">
              <span>
                去官网使用<small>需要多人一起画时，从这里开始</small>
              </span>
              <ArrowUpRight size={16} />
            </a>
            <a
              href="https://docs.excalidraw.com"
              target="_blank"
              rel="noreferrer"
            >
              <span>
                官方文档<small>查看完整功能与开发资料</small>
              </span>
              <ArrowUpRight size={16} />
            </a>
          </div>
        </aside>
      </div>

      <section
        className="reader-practice"
        id="hands-on"
        tabIndex={-1}
        aria-labelledby="reader-practice-title"
      >
        <div className="reader-practice-heading">
          <div>
            <h2 id="reader-practice-title">
              {projectTrialSections.experience}
            </h2>
            <p>改一张需求处理流程图：修改文字、调整位置，再把结果下载下来。</p>
          </div>
          <div className="reader-practice-actions">
            <span>约 3 分钟</span>
            <GlassButton
              variant="primary"
              onClick={onTry}
              data-action="open-whiteboard"
            >
              <PenTool size={16} />
              {labOpen ? "继续编辑白板" : "打开交互白板"}
            </GlassButton>
          </div>
        </div>
        <ProjectTrialSteps steps={excalidrawGuide.steps} />
        {labOpen ? (
          <EditorBoundary>
            <Suspense
              fallback={
                <div className="reader-editor-loading" role="status">
                  <Loader2 className="spin" size={24} />
                  <h3>正在打开白板…</h3>
                </div>
              }
            >
              <ExcalidrawLab dark={dark} onNotify={onNotify} />
            </Suspense>
          </EditorBoundary>
        ) : (
          <div className="reader-canvas-preview">
            <div
              className="reader-example"
              role="img"
              aria-label="练习完成后的流程：提出需求，讨论方案，确认结果"
            >
              <span>提出需求</span>
              <ArrowRight size={25} />
              <span>讨论方案</span>
              <ArrowRight size={25} />
              <span>确认结果</span>
            </div>
            <div className="reader-canvas-caption">
              <p>点击“打开交互白板”，即可在这里修改示例或画自己的内容。</p>
            </div>
          </div>
        )}
      </section>
      <section className="reader-formal">
        <h2>{projectTrialSections.start}</h2>
        <p>{excalidrawGuide.paragraphs[2].body}</p>
        <div className="reader-practice-notes">
          <p>
            <strong>图稿保存在这里</strong>
            自动保存到当前浏览器，清除浏览器数据后可能丢失。重要内容请从编辑器菜单下载画稿文件。
          </p>
          <p>
            <strong>想和别人一起画</strong>本站白板是单人编辑。请前往{" "}
            <a href="https://excalidraw.com" target="_blank" rel="noreferrer">
              Excalidraw 官网 <ArrowUpRight size={12} />
            </a>
            ，使用那里的多人协作功能。
          </p>
        </div>
      </section>
      <details className="reader-developer">
        <summary>开发者：把白板嵌入自己的产品</summary>
        <p>
          项目提供 React
          组件包，可以将编辑器嵌入应用。多人协作需要单独接入，并非安装组件后自动具备。
        </p>
        <a
          href="https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration"
          target="_blank"
          rel="noreferrer"
        >
          阅读官方集成说明 <ArrowUpRight size={14} />
        </a>
      </details>
    </>
  );
}
