import { useState } from "react";
import { BookOpen, Code2, FileText, GitBranch } from "lucide-react";
import type { Repository } from "../catalog";
import { getProjectGuide } from "../projectGuides";
import { WhiteboardPreview } from "./ProjectPreview";
import GeneratedProjectVisual from "./GeneratedProjectVisual";

/** A readable content map, never presented as an invented product screenshot. */
export default function ProjectCardVisual({ repo }: { repo: Repository }) {
  const guide = getProjectGuide(repo);
  const [failed, setFailed] = useState(false);
  if (repo.generated) return <GeneratedProjectVisual card={repo.generated} />;
  if (guide?.preview === "whiteboard")
    return (
      <div className="card-visual card-visual-board">
        <span className="card-visual-caption">手绘白板 · 操作示意</span>
        <WhiteboardPreview />
        <span className="card-visual-footnote">流程图、产品草图与系统结构</span>
      </div>
    );
  if (guide?.image && !failed)
    return (
      <div className="card-visual card-visual-image">
        <img
          src={guide.image}
          loading="lazy"
          alt={`${repo.name} README 官方界面截图`}
          onError={() => setFailed(true)}
        />
        <span className="card-visual-caption">README 官方截图</span>
      </div>
    );
  const entries = guide?.items.length
    ? guide.items.slice(0, 3)
    : guide?.features
        .slice(0, 3)
        .map((feature) => [feature.title, feature.text]) || [];
  return (
    <div
      className={`card-visual ${guide ? "card-visual-guide" : "card-visual-facts"}`}
    >
      <div className="card-visual-paper">
        <span className="card-visual-caption">
          {guide ? <BookOpen size={14} /> : <GitBranch size={14} />}
          {guide ? guide.category : repo.owner}
        </span>
        <strong className="card-visual-title">
          {guide?.title || repo.name}
        </strong>
        {guide ? (
          <div className="card-visual-map">
            {entries.map(([title, text]) => (
              <div key={title}>
                <span className="card-visual-node" />
                <span>
                  <strong>{text.length < 26 ? text : title}</strong>
                  {text.length < 26 && text !== title && <small>{title}</small>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="card-visual-author">{repo.description}</p>
            <div className="card-visual-metadata">
              <div>
                <Code2 size={16} />
                <span>
                  主要语言<strong>{repo.language}</strong>
                </span>
              </div>
              <div>
                <FileText size={16} />
                <span>
                  开源许可<strong>{repo.license}</strong>
                </span>
              </div>
            </div>
          </>
        )}
        <span className="card-visual-footnote">
          {guide ? "内容地图 · 依据 README 整理" : "仓库资料 · GitHub 公开信息"}
        </span>
      </div>
    </div>
  );
}
