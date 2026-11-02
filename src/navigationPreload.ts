import { useEffect } from "react";
import { categories } from "./catalog";
import { contentRequest, preloadContent } from "./observatoryApi";
import {
  preloadDiscovery,
  seedDiscovery,
  seedDiscoveryFilters,
} from "./useDiscoverySearch";
import { loadResource } from "./resourceCache";
import type { ApiEnvelope, SearchData } from "./api";
import { preloadTrial } from "./useTrialCatalog";
import { preloadProjectImages } from "./projectMedia";

const defaultTrends = "/trends?kind=stars&language=&topic=&days=7";
function mayPreload() {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return (
    navigator.onLine &&
    !document.hidden &&
    !connection?.saveData &&
    !["slow-2g", "2g"].includes(connection?.effectiveType || "")
  );
}
export function preloadCategory(id: string, language = "", sort = "stars") {
  if (!mayPreload()) return;
  const category = categories.find((item) => item.id === id);
  if (category)
    void preloadDiscovery(
      category.query + (language ? ` language:${language}` : ""),
      sort,
    ).catch(() => {});
}
export function preloadSection(section: string) {
  if (!mayPreload()) return;
  if (section === "trends") void preloadContent(defaultTrends).catch(() => {});
  if (section === "stories") {
    void preloadTrial().catch(() => {});
  }
  if (section === "discover") preloadCategory("all");
}
export function preloadTrialLink(repo: string) {
  if (!mayPreload()) return;
  if (repo.toLowerCase() !== "excalidraw/excalidraw")
    void preloadTrial(repo).catch(() => {});
}

/** Small read-only tasks run one at a time after the visible view has loaded. */
export function useNavigationPreload(ready: boolean, serverManaged = false) {
  useEffect(() => {
    if (serverManaged) {
      void loadResource("content:/catalog", (signal) =>
        contentRequest<{
          pages: {
            q: string;
            sort: string;
            page: number;
            result: ApiEnvelope<SearchData>;
          }[];
        }>("/catalog", signal),
      )
        .then((catalog) => {
          for (const page of catalog.data.pages) {
            seedDiscovery(page.q, page.sort, page.page, page.result);
            if (page.page === 1)
              preloadProjectImages(page.result.data.items, 4);
          }
          seedDiscoveryFilters();
        })
        .catch(() => {});
      if (mayPreload()) void preloadContent(defaultTrends).catch(() => {});
      return;
    }
    if (!ready) return;
    let cancelled = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const tasks = [
      () => preloadContent(defaultTrends),
      ...categories.map((category) => () => preloadDiscovery(category.query)),
    ];
    const schedule = () => {
      if (cancelled || !tasks.length) return;
      timer = setTimeout(() => {
        if ("requestIdleCallback" in window)
          idle = window.requestIdleCallback(() => void next(), {
            timeout: 1500,
          });
        else void next();
      }, 300);
    };
    const next = async () => {
      if (cancelled) return;
      if (mayPreload()) await tasks.shift()!().catch(() => {});
      schedule();
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [ready, serverManaged]);
}
