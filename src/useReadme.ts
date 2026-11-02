import { ApiError, request } from "./api";
import type { ReadmeData } from "./api";
import type { Repository } from "./catalog";
import { useResource } from "./resourceCache";

type Result = { data: ReadmeData; snapshot: boolean };
async function load(repo: Repository, signal: AbortSignal): Promise<Result> {
  try {
    const result = await request<ReadmeData>(
      `/repos/${repo.fullName.split("/").map(encodeURIComponent).join("/")}/readme`,
      signal,
    );
    return {
      data: { ...result.data, warning: result.warning },
      snapshot: false,
    };
  } catch (error) {
    const snapshots = (await import("./data/readme-snapshots.json"))
      .default as Record<string, ReadmeData>;
    if (snapshots[repo.fullName.toLowerCase()])
      return { data: snapshots[repo.fullName.toLowerCase()], snapshot: true };
    throw error;
  }
}
export function useReadme(repo: Repository, enabled = true) {
  const state = useResource<Result>(
    enabled ? `readme:${repo.fullName.toLowerCase()}` : null,
    (signal) => load(repo, signal),
    10 * 60_000,
  );
  return {
    content: state.value?.data || null,
    error: state.error as ApiError | null,
    snapshot: state.value?.snapshot || false,
    retry: state.retry,
  };
}

export function readmeParagraphs(markdown: string): string[] {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`]/g, "")
        .replace(/^>\s?/gm, "")
        .replace(/&nbsp;|<br\s*\/?\s*>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(
      (block) =>
        block.length > 65 &&
        block.length < 1200 &&
        !/^(#|\||[-*]\s|\d+\.\s)/.test(block) &&
        !/sponsor|all rights reserved|copyright|discord\.gg|badge|utm_source|javascript:/i.test(
          block,
        ),
    )
    .slice(0, 3);
}
