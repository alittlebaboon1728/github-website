import { useEffect, useRef, useSyncExternalStore } from "react";
import { ApiError, normalizeRepo, request } from "./api";
import type { ApiEnvelope, SearchData } from "./api";
import { snapshotDate, snapshotRepos } from "./catalog";
import type { Repository } from "./catalog";
import { preloadProjectImages } from "./projectMedia";
import { createPreparedProjectIndex } from "../shared/discovery-filter.mjs";
import {
  loadResource,
  NAVIGATION_TTL,
  peekResource,
  seedResource,
  invalidateResources,
} from "./resourceCache";

type State = {
  items: Repository[];
  page: number;
  total: number;
  source: "live" | "cache" | "snapshot" | null;
  fetchedAt: string;
  sourceNote: string;
  incomplete: boolean;
  exhausted: boolean;
  loading: boolean;
  error: ApiError | null;
  updatedAt: number;
  firstCount: number;
  failedPage?: number;
  serverManaged: boolean;
  pendingCount: number;
  preparationError: string;
  filterPreview: boolean;
  refreshPending: boolean;
};
type Entry = {
  state: State;
  listeners: Set<() => void>;
  pending?: Promise<void>;
  pages: Map<number, Repository[]>;
};
const views = new Map<string, Entry>();
const filterIndex = createPreparedProjectIndex();
let filterIndexReady = false;
function rememberPrepared(query: string, result: ApiEnvelope<SearchData>) {
  filterIndex.ingest(query, result);
  if (result.data.prepared && !result.data.filter_preview)
    filterIndexReady = true;
}
function localFilter(
  query: string,
  sort: string,
): ApiEnvelope<SearchData> | undefined {
  const selected = filterIndex.search(query, sort);
  if (!filterIndexReady || !selected) return;
  return {
    source: "cache",
    fetchedAt: selected.items.map((item) => item.fetchedAt || "").sort()[0],
    data: {
      total_count: selected.total,
      items: selected.items.map((item) => item.repo),
      cards: Object.fromEntries(
        selected.items.map((item) => [item.repo.full_name, item.card]),
      ),
      incomplete_results: false,
      prepared: true,
      filter_preview: true,
      refresh_pending: true,
    },
  };
}
export function discoveryPath(query: string, sort: string, page = 1) {
  return `/search?${new URLSearchParams({ q: query, sort, page: String(page) })}`;
}
export function preloadDiscovery(query: string, sort = "stars") {
  const path = discoveryPath(query, sort);
  return loadResource(
    `github:${path}`,
    (signal) => request<SearchData>(path, signal),
    { speculative: true },
  ).then((result) => {
    rememberPrepared(query, result);
    preloadProjectImages(result.data.items);
    return result;
  });
}
function resultState(result: ApiEnvelope<SearchData>) {
  const items = result.data.items.map((raw) => ({
    ...normalizeRepo(raw),
    generated: result.data.cards?.[raw.full_name],
  }));
  return {
    items,
    total: result.data.total_count,
    source: result.source,
    fetchedAt: result.fetchedAt,
    sourceNote: result.warning || "",
    incomplete: result.data.incomplete_results,
    exhausted:
      items.length === 0 &&
      !result.data.pending_count &&
      !result.data.refresh_pending,
    serverManaged: Boolean(result.data.prepared),
    pendingCount: result.data.pending_count || 0,
    preparationError: result.data.preparation_error || "",
    filterPreview: Boolean(result.data.filter_preview),
    refreshPending: Boolean(result.data.refresh_pending),
  };
}
function getView(query: string, sort: string) {
  const key = JSON.stringify([query, sort]);
  let entry = views.get(key);
  if (!entry) {
    const warm = peekResource<ApiEnvelope<SearchData>>(
      `github:${discoveryPath(query, sort)}`,
    );
    const local = warm?.value ? undefined : localFilter(query, sort);
    const initial = warm?.value || local;
    entry = {
      state: {
        items: [],
        page: 1,
        total: 0,
        source: null,
        fetchedAt: "",
        sourceNote: "",
        incomplete: false,
        exhausted: false,
        loading: !initial,
        error: null,
        failedPage: undefined,
        updatedAt: warm?.updatedAt || 0,
        firstCount: warm?.value?.data.items.length || 0,
        serverManaged: false,
        pendingCount: 0,
        preparationError: "",
        filterPreview: false,
        refreshPending: false,
        ...(initial ? resultState(initial) : {}),
      },
      listeners: new Set(),
      pages: new Map(initial ? [[1, resultState(initial).items]] : []),
    };
    views.set(key, entry);
    for (const [oldKey, old] of views) {
      if (views.size <= 24) break;
      if (!old.pending && !old.listeners.size && old !== entry)
        views.delete(oldKey);
    }
  }
  // A view may have been created before its intent prefetch finished.
  const warm = peekResource<ApiEnvelope<SearchData>>(
    `github:${discoveryPath(query, sort)}`,
  );
  if (!entry.state.source && warm?.value) {
    entry.state = {
      ...entry.state,
      ...resultState(warm.value),
      updatedAt: warm.updatedAt,
      firstCount: warm.value.data.items.length,
      loading: false,
    };
    entry.pages.set(1, entry.state.items);
  }
  return entry;
}
function commit(entry: Entry, state: State) {
  entry.state = state;
  for (const notify of entry.listeners) notify();
}
async function read(
  entry: Entry,
  query: string,
  sort: string,
  page: number,
  force: boolean,
  fallback: boolean,
  polling = false,
) {
  if (entry.pending) return entry.pending;
  if (
    !force &&
    page === 1 &&
    !entry.state.filterPreview &&
    Date.now() - entry.state.updatedAt < NAVIGATION_TTL
  )
    return;
  commit(entry, { ...entry.state, loading: true, error: null });
  const path = discoveryPath(query, sort, page);
  entry.pending = loadResource(
    `github:${path}`,
    (signal) => request<SearchData>(path, signal),
    { force },
  )
    .then(async (result) => {
      let acceptedPage = page;
      // Local and complete upstream pages use different cohorts. Switch at
      // page one so a newly finished later page cannot mix their pagination.
      if (
        entry.state.filterPreview &&
        !result.data.filter_preview &&
        page > 1
      ) {
        const firstPath = discoveryPath(query, sort);
        result = await loadResource(
          `github:${firstPath}`,
          (signal) => request<SearchData>(firstPath, signal),
          { force: true },
        );
        acceptedPage = 1;
      }
      rememberPrepared(query, result);
      const next = resultState(result);
      const previous = entry.state;
      if (previous.filterPreview !== next.filterPreview) {
        // A cached local page two must not be reused after page one upgrades
        // to the full upstream cohort, even while its normal TTL is fresh.
        invalidateResources(
          `github:${discoveryPath(query, sort).replace(/page=1$/, "page=")}`,
        );
        seedResource(
          `github:${discoveryPath(query, sort, acceptedPage)}`,
          result,
        );
      }
      if (
        (force && !polling && page === 1) ||
        previous.source === "snapshot" ||
        previous.filterPreview !== next.filterPreview
      )
        entry.pages.clear();
      entry.pages.set(acceptedPage, next.items);
      const rows = [...entry.pages]
        .sort(([a], [b]) => a - b)
        .flatMap(([, items]) => items);
      commit(entry, {
        ...previous,
        ...next,
        items: [...new Map(rows.map((repo) => [repo.fullName, repo])).values()],
        page:
          previous.filterPreview !== next.filterPreview
            ? acceptedPage
            : force && !polling
              ? acceptedPage
              : Math.max(acceptedPage, previous.page),
        firstCount:
          acceptedPage === 1 ? next.items.length : previous.firstCount,
        updatedAt: Date.now(),
        loading: false,
        error: null,
        failedPage: undefined,
      });
    })
    .catch((problem) => {
      const error =
        problem instanceof ApiError
          ? problem
          : new ApiError("数据读取失败，请重试。");
      const offline = !entry.state.source && fallback;
      commit(entry, {
        ...entry.state,
        loading: false,
        error,
        failedPage: page,
        ...(offline
          ? {
              items: snapshotRepos,
              source: "snapshot" as const,
              fetchedAt: snapshotDate,
              total: snapshotRepos.length,
            }
          : {}),
      });
    })
    .finally(() => {
      entry.pending = undefined;
    });
  return entry.pending;
}

/** Each query owns its list and pagination, so rapid switches cannot mix responses. */
export function useDiscoverySearch(
  query: string,
  sort: string,
  enabled: boolean,
  revision: number,
  fallback: boolean,
) {
  const entry = getView(query, sort);
  const state = useSyncExternalStore(
    (notify) => {
      entry.listeners.add(notify);
      return () => {
        entry.listeners.delete(notify);
      };
    },
    () => entry.state,
  );
  const previousRevision = useRef(revision);
  useEffect(() => {
    const force = previousRevision.current !== revision;
    previousRevision.current = revision;
    if (enabled) void read(entry, query, sort, 1, force, fallback);
  }, [entry, query, sort, enabled, revision, fallback]);
  useEffect(() => {
    if (
      !enabled ||
      !state.serverManaged ||
      (!state.pendingCount && !state.refreshPending) ||
      state.error ||
      state.preparationError ||
      state.loading
    )
      return;
    const timer = setTimeout(
      () =>
        void read(
          entry,
          query,
          sort,
          state.filterPreview ? 1 : state.page,
          true,
          fallback,
          true,
        ),
      state.filterPreview ? 1500 : 2500,
    );
    return () => clearTimeout(timer);
  }, [
    entry,
    query,
    sort,
    enabled,
    state.serverManaged,
    state.pendingCount,
    state.page,
    state.updatedAt,
    state.error,
    state.preparationError,
    state.refreshPending,
    state.filterPreview,
    state.loading,
    fallback,
  ]);
  return {
    ...state,
    loading: enabled && state.loading,
    retry: () =>
      void read(
        entry,
        query,
        sort,
        entry.state.failedPage || 1,
        true,
        fallback,
      ),
    loadMore: () =>
      void read(entry, query, sort, entry.state.page + 1, false, fallback),
  };
}

/** One local response supplies all default categories, including their next pages. */
export function seedDiscovery(
  query: string,
  sort: string,
  page: number,
  result: ApiEnvelope<SearchData>,
) {
  rememberPrepared(query, result);
  seedResource(`github:${discoveryPath(query, sort, page)}`, result);
  if (page !== 1) return;
  const entry = views.get(JSON.stringify([query, sort]));
  if (!entry || entry.pending || entry.state.page > 1) return;
  const next = resultState(result);
  entry.pages.set(1, next.items);
  commit(entry, {
    ...entry.state,
    ...next,
    firstCount: next.items.length,
    updatedAt: Date.now(),
    loading: false,
    error: null,
  });
}

/** Warm all languages and sort orders from the same downloaded Chinese catalog. */
export function seedDiscoveryFilters() {
  for (const [key, entry] of views) {
    if (entry.state.source && !entry.state.filterPreview) continue;
    const [query, sort] = JSON.parse(key) as [string, string];
    const preview = localFilter(query, sort);
    if (!preview) continue;
    const next = resultState(preview);
    entry.pages.set(1, next.items);
    commit(entry, {
      ...entry.state,
      ...next,
      page: 1,
      firstCount: next.items.length,
      loading: Boolean(entry.pending),
    });
  }
}
