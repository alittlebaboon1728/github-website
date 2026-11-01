import { useEffect, useState } from "react";
import { ApiError, request } from "./api";
import type { ReadmeData } from "./api";
import type { Repository } from "./catalog";

type Result = { data: ReadmeData; snapshot: boolean };
const cache = new Map<string, Promise<Result>>();
async function load(repo: Repository, refresh: boolean): Promise<Result> {
  const key = repo.fullName.toLowerCase();
  if (refresh) cache.delete(key);
  if (!cache.has(key)) {
    const pending = request<ReadmeData>(
      `/repos/${repo.fullName.split("/").map(encodeURIComponent).join("/")}/readme`,
    )
      .then((result) => ({
        data: { ...result.data, warning: result.warning },
        snapshot: false,
      }))
      .catch(async (error) => {
        const snapshots = (await import("./data/readme-snapshots.json"))
          .default as Record<string, ReadmeData>;
        if (snapshots[key]) return { data: snapshots[key], snapshot: true };
        cache.delete(key);
        throw error;
      });
    cache.set(key, pending);
  }
  return cache.get(key)!;
}
export function useReadme(repo: Repository, enabled = true) {
  const [content, setContent] = useState<ReadmeData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [snapshot, setSnapshot] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setContent(null);
    setError(null);
    load(repo, nonce > 0)
      .then((result) => {
        if (active) {
          setContent(result.data);
          setSnapshot(result.snapshot);
        }
      })
      .catch((problem) => {
        if (active) setError(problem);
      });
    return () => {
      active = false;
    };
  }, [repo.fullName, enabled, nonce]);
  return { content, error, snapshot, retry: () => setNonce((n) => n + 1) };
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
