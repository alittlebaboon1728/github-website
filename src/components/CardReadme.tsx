import { useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import type { Repository } from "../catalog";
import { readmeParagraphs, useReadme } from "../useReadme";

export default function CardReadme({ repo }: { repo: Repository }) {
  const [open, setOpen] = useState(false);
  const { content, error, snapshot, retry } = useReadme(repo, open);
  const paragraphs = content ? readmeParagraphs(content.content) : [];
  return (
    <details
      className="card-readme"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>展开作者说明</summary>
      {open && (
        <div>
          {!content && !error && (
            <span className="card-readme-loading">
              <Loader2 size={13} className="spin" />
              正在读取 README…
            </span>
          )}
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {content && !paragraphs.length && (
            <p>README 主要由目录、代码或图片组成，可打开原文查看。</p>
          )}
          {error && (
            <p>
              暂时无法读取 README。
              <button type="button" onClick={retry}>
                重试
              </button>
            </p>
          )}
          {content && (
            <small>
              {snapshot
                ? "已保存的 README 参考快照 · 2026/10/31"
                : "README 作者原文"}
            </small>
          )}
          <a href={`${repo.url}#readme`} target="_blank" rel="noreferrer">
            阅读完整 README
            <ArrowUpRight size={12} />
          </a>
        </div>
      )}
    </details>
  );
}
