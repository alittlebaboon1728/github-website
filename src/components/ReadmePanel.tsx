import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { Repository } from "../catalog";
import { useReadme } from "../useReadme";

function resolveReadmeUrl(
  value: string,
  repo: Repository,
  path: string,
  image = false,
) {
  try {
    const directory = path.split("/").slice(0, -1).join("/");
    const base = image
      ? `https://raw.githubusercontent.com/${repo.fullName}/${encodeURIComponent(repo.defaultBranch)}/${directory ? directory + "/" : ""}`
      : `https://github.com/${repo.fullName}/blob/${encodeURIComponent(repo.defaultBranch)}/${directory ? directory + "/" : ""}`;
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export default function ReadmePanel({ repo }: { repo: Repository }) {
  const { content, error, snapshot, retry } = useReadme(repo);
  return (
    <section className="readme-panel">
      <div className="readme-heading">
        <span>
          <BookOpen size={16} />
          README · 项目原文
        </span>
        <a
          href={content?.html_url || `${repo.url}#readme`}
          target="_blank"
          rel="noreferrer"
        >
          在 GitHub 阅读
          <ExternalLink size={12} />
        </a>
      </div>
      {error ? (
        <div className="readme-empty">
          <BookOpen size={26} />
          <h3>{error.message}</h3>
          <button className="text-action" onClick={retry}>
            <RefreshCw size={13} />
            重新读取
          </button>
        </div>
      ) : !content ? (
        <div className="readme-empty">
          <Loader2 className="spin" size={22} />
          正在读取项目文档…
        </div>
      ) : (
        <>
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              urlTransform={(value) => value}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={resolveReadmeUrl(href || "", repo, content.path)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {children}
                  </a>
                ),
                img: ({ src, alt }) => {
                  const safe = resolveReadmeUrl(
                    typeof src === "string" ? src : "",
                    repo,
                    content.path,
                    true,
                  );
                  return safe ? (
                    <img
                      src={safe}
                      alt={alt || "项目文档图片"}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : null;
                },
              }}
            >
              {content.content}
            </ReactMarkdown>
          </div>
          <p className="readme-bottom">
            {snapshot
              ? "GitHub 暂时不可用，显示 2026/10/31 保存的 README 参考快照。"
              : content.warning
                ? content.warning
                : content.truncated
                  ? "README 较长，此处展示前半部分；完整内容请前往 GitHub。"
                  : "保留项目作者的原始说明；完整排版请前往 GitHub 阅读。"}
          </p>
        </>
      )}
    </section>
  );
}
