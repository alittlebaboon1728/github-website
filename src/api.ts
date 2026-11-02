import type { Repository } from "./catalog";
import type { GeneratedCard } from "./generatedCards";
import type { ProjectMedia } from "./projectMedia";
export type ApiEnvelope<T> = {
  data: T;
  source: "live" | "cache";
  fetchedAt: string;
  rateRemaining?: string;
  provider?: "github-api" | "github-web" | "github-raw";
  stale?: boolean;
  warning?: string;
};
export type RawRepository = {
  media?: ProjectMedia;
  id: number;
  owner: { login: string; avatar_url: string };
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number | null;
  pushed_at: string | null;
  topics?: string[];
  html_url: string;
  homepage: string | null;
  license: { spdx_id: string } | null;
  default_branch: string;
  created_at: string | null;
  open_issues_count: number | null;
  archived: boolean;
};
export type SearchData = {
  cards?: Record<string, GeneratedCard>;
  prepared?: boolean;
  pending_count?: number;
  preparation_error?: string;
  filter_preview?: boolean;
  refresh_pending?: boolean;
  total_count: number;
  incomplete_results: boolean;
  items: RawRepository[];
};
export type ReadmeData = {
  content: string;
  path: string;
  html_url: string;
  truncated: boolean;
  warning?: string;
};
export class ApiError extends Error {
  status: number;
  resetAt: string | null;
  constructor(message: string, status = 500, resetAt: string | null = null) {
    super(message);
    this.status = status;
    this.resetAt = resetAt;
  }
}
export async function request<T>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/github${path}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("网络暂时不可用，请检查连接后重试。", 0);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError("数据服务没有返回有效内容，请稍后重试。", 502);
  }
  if (!response.ok)
    throw new ApiError(
      result.error || "暂时无法读取 GitHub 数据。",
      response.status,
      result.resetAt,
    );
  return result;
}
export function normalizeRepo(raw: RawRepository): Repository {
  const colors: Record<string, string> = {
    TypeScript: "#9d92c1",
    JavaScript: "#c5a754",
    Python: "#7e9ca8",
    Go: "#73a9b3",
    Rust: "#b58a70",
    HTML: "#bf8267",
    "C++": "#b1849f",
    Shell: "#9bac77",
    CSS: "#ac91b2",
  };
  const tags = raw.topics || [];
  const icon: Repository["icon"] = raw.name.includes("excalidraw")
    ? "globe"
    : tags.some((t) => ["ai", "llm", "artificial-intelligence"].includes(t))
      ? "spark"
      : tags.some((t) => ["design", "react", "components"].includes(t))
        ? "box"
        : ["Python", "Rust", "Go"].includes(raw.language || "")
          ? "terminal"
          : "code";
  return {
    id: String(raw.id),
    owner: raw.owner.login,
    name: raw.name,
    fullName: raw.full_name,
    description: raw.description || "这个项目暂时没有填写简介。",
    language: raw.language || "未标注",
    color: colors[raw.language || ""] || "#9bab88",
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    updated: raw.pushed_at,
    icon,
    tint: {
      spark: "sage",
      globe: "peach",
      box: "sand",
      terminal: "lavender",
      code: "sage",
      layers: "peach",
    }[icon],
    tags,
    url: raw.html_url,
    avatar: sizedAvatar(raw.owner.avatar_url),
    media: raw.media,
    homepage: raw.homepage || "",
    license: raw.license?.spdx_id || "未声明",
    defaultBranch: raw.default_branch,
    createdAt: raw.created_at,
    openIssues: raw.open_issues_count,
    archived: raw.archived,
  };
}
function sizedAvatar(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "avatars.githubusercontent.com") {
      url.searchParams.set("s", "80");
      return url.href;
    }
  } catch {
    /* Local cached image URLs are already sized. */
  }
  return value;
}
export async function fetchRepository(fullName: string, signal?: AbortSignal) {
  const result = await request<RawRepository>(
    `/repos/${fullName.split("/").map(encodeURIComponent).join("/")}`,
    signal,
  );
  return { ...result, data: normalizeRepo(result.data) };
}
export function repositoryFromInput(input: string) {
  const match = input
    .trim()
    .match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/)?$/i);
  return match ? `${match[1]}/${match[2].replace(/\.git$/, "")}` : null;
}
