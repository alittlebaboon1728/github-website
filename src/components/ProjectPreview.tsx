import { useId, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Minus,
  MousePointer2,
  Plus,
  Square,
  Type,
} from "lucide-react";
import type { Repository } from "../catalog";
import { getProjectGuide } from "../projectGuides";

export function WhiteboardPreview({
  interactive = false,
}: {
  interactive?: boolean;
}) {
  const [scene, setScene] = useState("flow");
  const [note, setNote] = useState(false);
  const arrowId = useId();
  return (
    <div className={`product-board ${interactive ? "board-interactive" : ""}`}>
      <div className="board-tools" aria-hidden="true">
        <MousePointer2 size={14} />
        <Square size={14} />
        <Minus size={14} />
        <Type size={14} />
      </div>
      <svg
        className="board-drawing"
        viewBox={scene === "flow" ? "0 65 580 170" : "0 0 580 265"}
        role="img"
        aria-label={
          scene === "flow"
            ? "需求确认、画出草图、开始开发的流程图"
            : "包含导航和两个内容区域的网页线框图"
        }
      >
        <defs>
          <marker
            id={arrowId}
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path
              d="M1 1L7 4L1 7"
              fill="none"
              stroke="#6b687a"
              strokeWidth="1.3"
            />
          </marker>
        </defs>
        {scene === "flow" ? (
          <g className="board-flow">
            <rect
              x="36"
              y="96"
              width="128"
              height="70"
              rx="8"
              fill="#e7e0fa"
              stroke="#8873b1"
            />
            <text x="100" y="137" textAnchor="middle">
              需求确认
            </text>
            <path
              d="M171 130 Q201 126 224 132"
              markerEnd={`url(#${arrowId})`}
              fill="none"
              stroke="#6b687a"
            />
            <rect
              x="235"
              y="95"
              width="128"
              height="70"
              rx="8"
              fill="#f9e7cd"
              stroke="#b59b75"
            />
            <text x="299" y="137" textAnchor="middle">
              画出草图
            </text>
            <path
              d="M369 132 Q397 128 420 131"
              markerEnd={`url(#${arrowId})`}
              fill="none"
              stroke="#6b687a"
            />
            <rect
              x="431"
              y="96"
              width="116"
              height="70"
              rx="8"
              fill="#dfece3"
              stroke="#809e88"
            />
            <text x="489" y="137" textAnchor="middle">
              开始开发
            </text>
            <path
              d="M285 175Q285 204 328 203"
              fill="none"
              stroke="#aaa0b7"
              strokeDasharray="4 4"
            />
            <text x="333" y="209" className="board-annotation">
              先不用纠结细节
            </text>
          </g>
        ) : (
          <g className="board-wireframe">
            <rect
              x="70"
              y="35"
              width="440"
              height="195"
              rx="8"
              fill="#fff"
              stroke="#81758d"
            />
            <path d="M70 69H510" stroke="#aaa0b7" />
            <circle cx="87" cy="51" r="3" fill="#c7bbd9" />
            <circle cx="99" cy="51" r="3" fill="#c7bbd9" />
            <rect x="94" y="88" width="96" height="120" rx="4" fill="#ece7f5" />
            <path d="M111 110h60m-60 24h48m-48 24h55" stroke="#9a89b2" />
            <rect
              x="209"
              y="88"
              width="277"
              height="47"
              rx="4"
              fill="#f8ead5"
            />
            <text x="347" y="118" textAnchor="middle">
              页面标题
            </text>
            <rect
              x="209"
              y="150"
              width="129"
              height="58"
              rx="4"
              fill="#e1ece5"
            />
            <rect
              x="354"
              y="150"
              width="132"
              height="58"
              rx="4"
              fill="#e6eaf4"
            />
          </g>
        )}
        {note && (
          <g className="board-added">
            <rect
              x="397"
              y="184"
              width="142"
              height="58"
              rx="2"
              fill="#fff1a8"
              transform="rotate(-5 468 213)"
            />
            <text x="468" y="218" textAnchor="middle" fontSize="14">
              记得听听用户怎么说
            </text>
          </g>
        )}
      </svg>
      {interactive ? (
        <div className="board-switcher">
          <div role="group" aria-label="选择白板示例">
            <button
              aria-pressed={scene === "flow"}
              onClick={() => setScene("flow")}
            >
              流程图
            </button>
            <button
              aria-pressed={scene === "wireframe"}
              onClick={() => setScene("wireframe")}
            >
              网页草图
            </button>
          </div>
          <button
            className="board-add"
            aria-pressed={note}
            onClick={() => setNote(!note)}
          >
            {note ? <Check size={13} /> : <Plus size={13} />}便签
          </button>
        </div>
      ) : (
        <span className="board-file">product-plan.excalidraw</span>
      )}
    </div>
  );
}

export default function ProjectPreview({
  repo,
  large = false,
}: {
  repo: Repository;
  large?: boolean;
}) {
  const guide = getProjectGuide(repo);
  const [imageFailed, setImageFailed] = useState(false);
  if (guide?.preview === "whiteboard")
    return (
      <div className="project-preview preview-whiteboard">
        <WhiteboardPreview />
      </div>
    );
  const image = guide?.image;
  return (
    <div
      className={`project-preview preview-${guide?.preview || "original"} ${large ? "preview-large" : ""}`}
      style={
        {
          "--preview-accent": guide?.accent || "#51646b",
          "--preview-bg": guide?.background || "#edf0ee",
        } as React.CSSProperties
      }
    >
      {image && !imageFailed ? (
        <>
          <img
            src={image}
            loading="lazy"
            alt={`${repo.name} 官方 README 中的界面截图`}
            onError={() => setImageFailed(true)}
          />
          <span className="preview-image-credit">README 官方截图</span>
        </>
      ) : (
        <div className="readme-preview">
          <div className="preview-file">
            <span>
              <FileText size={12} />
              {guide?.previewTitle || "作者简介"}
            </span>
            <span>{guide ? "内容节选" : "GitHub"}</span>
          </div>
          <div className="preview-document">
            <h3>
              {guide?.preview === "tutorials" ? "Build your own X" : repo.name}
            </h3>
            {guide?.preview === "apis" ? (
              <div className="api-preview-table">
                <div>
                  <span>API</span>
                  <span>提供什么</span>
                  <span>认证</span>
                </div>
                {guide.items.map(([name, text]) => (
                  <div key={name}>
                    <strong>{name}</strong>
                    <span>{text.split(" / ")[0]}</span>
                    <span className="no-auth">不需要</span>
                  </div>
                ))}
              </div>
            ) : guide?.preview === "terminal" ? (
              <div className="terminal-preview">
                {guide.items.map(([command, text]) => (
                  <div key={command}>
                    <span className="terminal-comment"># {text}</span>
                    <code>
                      <span>$</span> {command}
                    </code>
                  </div>
                ))}
              </div>
            ) : guide ? (
              <div className="preview-entries">
                {guide.items.map(([title, subtitle], index) => (
                  <div className="preview-entry" key={title}>
                    <span className="preview-entry-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <span>{subtitle}</span>
                    </div>
                    <ChevronRight size={13} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="preview-author-description">{repo.description}</p>
                <div className="preview-repo-topics">
                  {repo.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <span className="preview-read-more">
                  打开介绍，阅读作者的 README <ArrowUpRight size={13} />
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
