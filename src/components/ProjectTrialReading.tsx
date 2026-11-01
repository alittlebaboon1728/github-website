import { ArrowUpRight, BookOpen } from "lucide-react";
import { projectTrialSections } from "../projectTrialSections";

/** The approved Excalidraw reading layout, shared by native and generated trials. */
export default function ProjectTrialReading({
  introduction,
  usage,
  sourceUrl,
}: {
  introduction: string;
  usage: string;
  sourceUrl: string;
}) {
  return (
    <section className="reader-copy" aria-label="README 中文转述">
      <p className="reader-source-label">
        <BookOpen size={16} /> README 中文转述
      </p>
      <section>
        <h2>{projectTrialSections.introduction}</h2>
        <p>{introduction}</p>
      </section>
      <section>
        <h2>{projectTrialSections.usage}</h2>
        <p>{usage}</p>
      </section>
      <p className="reader-citation">
        依据项目 README 整理。
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          查看来源 <ArrowUpRight size={13} />
        </a>
      </p>
    </section>
  );
}
