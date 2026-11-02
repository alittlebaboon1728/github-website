import { createHash } from "node:crypto";
import categories from "../shared/discovery-categories.json" with { type: "json" };
import { buildGitHubPath, GitHubError } from "./github.mjs";
import { rankingQuery } from "./trends.mjs";
import {
  createPreparedProjectIndex,
  parseDiscoveryFilter,
} from "../shared/discovery-filter.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (q) =>
  q
    .replace(/(?:^|\s)is:public(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "is:public";
const validRepo = (repo) =>
  repo.private === false && /^[\w.-]+\/[\w.-]+$/.test(repo.full_name);

/** The disk is the durable library; memory eviction never removes its files. */
export function createDiscoveryLibrary({
  github,
  cards,
  store,
  media,
  enabled = true,
  now = Date.now,
  refreshMs = 30 * 60_000,
  retryMs = 120_000,
  defaults = [...categories, { id: "ranking", query: rankingQuery() }],
} = {}) {
  const scopes = new Map();
  const records = new Map();
  const pendingReads = new Map();
  const preparedIndex = createPreparedProjectIndex();
  const activePages = new Map(),
    requestedPages = new Map();
  let foregroundTimer,
    foregroundBusy = false;
  let initialized,
    timer,
    active,
    running = false,
    current = null;
  let indexDirty = false,
    indexWrite = Promise.resolve();
  const available = Boolean(enabled && store.enabled);
  function normalize({ q = "is:public", sort = "stars", page = 1 }) {
    page = Number(page);
    buildGitHubPath(
      new URL(
        `/api/github/search?${new URLSearchParams({ q, sort, page: String(page) })}`,
        "http://local",
      ),
    );
    return { q: canonical(q), sort, page };
  }
  const scopeKey = (q, sort) => digest(JSON.stringify([q, sort]));
  const fileKey = (scope, page) => `discovery-page-${scope.key}-${page}`;
  const upstreamPath = (scope, page) =>
    buildGitHubPath(
      new URL(
        `/api/github/search?${new URLSearchParams({ q: scope.q, sort: scope.sort, page: String(page) })}`,
        "http://local",
      ),
    );
  function saveIndex() {
    if (!indexDirty) return indexWrite;
    indexDirty = false;
    const snapshot = structuredClone({
      version: 1,
      scopes: [...scopes.values()],
    });
    const operation = store.update("discovery-library", () => snapshot);
    indexWrite = operation.catch(() => {
      indexDirty = true;
    });
    return operation;
  }
  function ensure(input, defaultScope = false) {
    const { q, sort, page } = normalize(input);
    const key = scopeKey(q, sort);
    let scope = scopes.get(key);
    if (!scope) {
      scope = {
        key,
        q,
        sort,
        pages: Math.max(3, page),
        defaultScope,
        checked: {},
        visitedAt: now(),
      };
      scopes.set(key, scope);
      indexDirty = true;
    } else {
      const pages = Math.max(scope.pages, 3, page);
      if (
        pages !== scope.pages ||
        (defaultScope && !scope.defaultScope) ||
        now() - scope.visitedAt >= 60_000
      ) {
        scope.pages = pages;
        scope.defaultScope ||= defaultScope;
        scope.visitedAt = now();
        indexDirty = true;
      }
    }
    return scope;
  }
  async function init() {
    return (initialized ||= (async () => {
      const saved = await store.read("discovery-library").catch(() => null);
      for (const entry of Array.isArray(saved?.scopes) ? saved.scopes : []) {
        try {
          const scope = ensure({
            q: entry.q,
            sort: entry.sort,
            page: Math.min(84, Math.max(1, entry.pages || 1)),
          });
          scope.checked = Object.fromEntries(
            Object.entries(entry.checked || {}).filter(
              ([page, value]) =>
                Number.isInteger(Number(page)) &&
                Number(page) >= 1 &&
                Number(page) <= 84 &&
                value &&
                Number.isFinite(value.at) &&
                Number.isFinite(value.nextAt),
            ),
          );
          scope.visitedAt = entry.visitedAt || 0;
        } catch {
          /* Ignore an obsolete/corrupt entry without losing other scopes. */
        }
      }
      for (const category of defaults)
        ensure({ q: category.query, sort: "stars" }, true);
      await Promise.all(
        [...scopes.values()].flatMap((scope) =>
          Array.from({ length: scope.pages }, async (_, index) => {
            const page = index + 1;
            const record = await load(scope, page);
            if (!record && !scope.checked[page]?.end)
              delete scope.checked[page];
          }),
        ),
      );
    })());
  }
  function remember(key, record) {
    records.delete(key);
    records.set(key, record);
    const scope = [...scopes.values()].find((scope) =>
      key.startsWith(`discovery-page-${scope.key}-`),
    );
    if (scope) preparedIndex.ingest(scope.q, record.result);
    if (records.size > 128) records.delete(records.keys().next().value);
  }
  function makeRecord(raw, summaries, errors = {}) {
    const items = (raw.data.items || []).filter(validRepo);
    const visible = items.filter((repo) => summaries[repo.full_name]);
    const pending = items.length - visible.length;
    return {
      version: 1,
      savedAt: now(),
      complete: pending === 0,
      raw,
      result: {
        ...raw,
        source: "cache",
        data: {
          ...raw.data,
          items: visible,
          cards: Object.fromEntries(
            visible.map((repo) => [repo.full_name, summaries[repo.full_name]]),
          ),
          prepared: true,
          pending_count: pending,
          preparation_error: Object.keys(errors).length
            ? "部分中文介绍暂未更新，服务端会自动重试。"
            : "",
        },
      },
    };
  }
  async function load(scope, page) {
    const key = fileKey(scope, page);
    if (records.has(key)) return records.get(key);
    if (pendingReads.has(key)) return pendingReads.get(key);
    const pending = (async () => {
      let record = await store.read(key).catch(() => null);
      if (
        record?.version !== 1 ||
        !record.result?.data?.prepared ||
        !Array.isArray(record.raw?.data?.items)
      )
        record = null;
      if (!record) {
        // Adopt existing raw pages and Chinese summaries on the very first upgrade.
        const legacy = await store
          .read(`card-page-${digest(upstreamPath(scope, page))}`)
          .catch(() => null);
        if (legacy?.result?.data?.items) {
          legacy.result.data.page = page;
          const summaries = await cards.cached(
            legacy.result.data.items.filter(validRepo),
          );
          record = makeRecord(legacy.result, summaries);
          record.savedAt = legacy.savedAt || now();
        }
      }
      if (record) {
        remember(key, record);
        media?.warm(record.raw.data.items);
      }
      return record;
    })().finally(() => pendingReads.delete(key));
    pendingReads.set(key, pending);
    return pending;
  }
  async function publish(scope, page, record) {
    const key = fileKey(scope, page);
    const previous = records.get(key);
    // Updating a list must never replace an already complete page with a half-built page.
    if (previous?.complete && !record.complete) return;
    remember(key, record);
    await store.update(key, () => record);
  }
  async function response(record, scope) {
    const stale =
      Boolean(record.result.stale) || now() - record.savedAt >= refreshMs;
    const problem = scope.checked?.[record.result.data.page]?.error;
    return {
      ...record.result,
      data: {
        ...record.result.data,
        ...(media
          ? { items: await media.decorate(record.result.data.items) }
          : {}),
        ...(!record.complete && problem
          ? {
              preparation_error:
                record.result.data.preparation_error || problem,
            }
          : {}),
      },
      stale,
      ...(stale
        ? {
            warning:
              record.result.warning ||
              "显示本机已保存的中文项目，服务端正在后台更新。",
          }
        : {}),
      ...(problem && record.complete
        ? { warning: "本次后台更新暂未完成，继续显示本机已保存的中文项目。" }
        : {}),
    };
  }
  function wake() {
    if (!running || active) return;
    clearTimeout(timer);
    timer = setTimeout(loop, 20);
    timer.unref?.();
  }
  function refresh(scope, page, priority = -10) {
    const key = fileKey(scope, page);
    if (activePages.has(key)) return activePages.get(key);
    const operation = refreshPage(scope, page, priority).finally(() =>
      activePages.delete(key),
    );
    activePages.set(key, operation);
    return operation;
  }
  async function refreshPage(scope, page, priority) {
    const progress = {
      q: scope.q,
      sort: scope.sort,
      page,
      stage: "读取项目列表",
    };
    current = progress;
    let record = await load(scope, page);
    try {
      const raw =
        record?.raw && now() - Date.parse(record.raw.fetchedAt) < 10 * 60_000
          ? record.raw
          : await github(upstreamPath(scope, page));
      raw.data.page = page;
      const repositories = (raw.data.items || []).filter(validRepo);
      media?.warm(repositories);
      let summaries = await cards.cached(repositories);
      await publish(scope, page, makeRecord(raw, summaries));
      progress.stage = "补齐中文概括";
      const result = await cards.prepare(repositories, {
        priority,
        onCard: async (repo, card) => {
          summaries = { ...summaries, [repo.full_name]: card };
          await publish(scope, page, makeRecord(raw, summaries));
        },
      });
      summaries = { ...summaries, ...result.cards };
      record = makeRecord(raw, summaries, result.errors);
      await publish(scope, page, record);
      const failed = Object.keys(result.errors).length;
      scope.checked[page] = {
        at: now(),
        nextAt: now() + (failed ? retryMs : refreshMs),
        error: failed ? "部分中文介绍暂未更新。" : "",
      };
      // A verified empty end page should not create more unnecessary requests.
      if (
        !repositories.length ||
        page * 12 >= Math.min(raw.data.total_count, 1000)
      )
        for (let next = page + 1; next <= scope.pages; next++)
          scope.checked[next] = {
            at: now(),
            nextAt: now() + refreshMs,
            end: true,
          };
    } catch (error) {
      const reset = Date.parse(error.resetAt || "");
      scope.checked[page] = {
        at: now(),
        nextAt: Math.max(now() + retryMs, Number.isFinite(reset) ? reset : 0),
        error:
          error instanceof GitHubError
            ? error.message
            : "后台准备暂未完成，将自动重试。",
      };
    } finally {
      if (current === progress) current = null;
      indexDirty = true;
      await saveIndex();
    }
  }
  function drainForeground() {
    if (!running || foregroundBusy) return;
    const next = [...requestedPages.values()].at(-1);
    if (!next) return;
    const { scope, page } = next,
      key = fileKey(scope, page);
    requestedPages.delete(key);
    if (activePages.has(key) || scope.checked[page]?.nextAt > now()) {
      foregroundTimer = setTimeout(drainForeground, 0);
      foregroundTimer.unref?.();
      return;
    }
    foregroundBusy = true;
    void refresh(scope, page, 0)
      .catch(() => {})
      .finally(() => {
        foregroundBusy = false;
        drainForeground();
      });
  }
  function prioritize(scope, page) {
    if (
      !running ||
      activePages.has(fileKey(scope, page)) ||
      scope.checked[page]?.nextAt > now()
    )
      return;
    const key = fileKey(scope, page);
    requestedPages.delete(key);
    requestedPages.set(key, { scope, page });
    if (requestedPages.size > 24)
      requestedPages.delete(requestedPages.keys().next().value);
    clearTimeout(foregroundTimer);
    foregroundTimer = setTimeout(drainForeground, 0);
    foregroundTimer.unref?.();
  }
  async function filterPreview(scope, page) {
    const selected = preparedIndex.search(scope.q, scope.sort, page);
    if (!selected) return null;
    const problem =
      scope.checked[page]?.nextAt > now() ? scope.checked[page]?.error : "";
    const result = {
      source: "cache",
      fetchedAt:
        selected.items
          .map((item) => item.fetchedAt)
          .filter(Boolean)
          .sort()[0] || new Date(now()).toISOString(),
      data: {
        page,
        total_count: selected.total,
        incomplete_results: false,
        prepared: true,
        filter_preview: true,
        refresh_pending: running && !problem,
        pending_count: 0,
        preparation_error:
          problem || (!running ? "更新已暂停，先显示已收录的匹配项目。" : ""),
        items: selected.items.map((item) => item.repo),
        cards: Object.fromEntries(
          selected.items.map((item) => [item.repo.full_name, item.card]),
        ),
      },
    };
    if (media) result.data.items = await media.decorate(result.data.items);
    return result;
  }
  async function tick() {
    if (!available) return false;
    await init();
    const candidates = [...scopes.values()].flatMap((scope) =>
      Array.from({ length: scope.pages }, (_, index) => ({
        scope,
        page: index + 1,
      })).filter(
        ({ page }) =>
          !activePages.has(fileKey(scope, page)) &&
          (!scope.checked[page] || scope.checked[page].nextAt <= now()),
      ),
    );
    candidates.sort((a, b) => {
      const aChecked = a.scope.checked[a.page],
        bChecked = b.scope.checked[b.page];
      return (
        Number(Boolean(aChecked)) - Number(Boolean(bChecked)) ||
        a.page - b.page ||
        Number(b.scope.defaultScope) - Number(a.scope.defaultScope) ||
        (aChecked?.at || 0) - (bChecked?.at || 0)
      );
    });
    if (!candidates.length) return false;
    await refresh(candidates[0].scope, candidates[0].page);
    return true;
  }
  async function loop() {
    if (!running || active) return;
    active = tick();
    let worked;
    try {
      worked = await active;
    } catch {
      worked = false;
    }
    active = null;
    if (running) {
      timer = setTimeout(loop, worked ? 150 : 10_000);
      timer.unref?.();
    }
  }
  return {
    enabled: available,
    pause() {
      running = false;
      clearTimeout(timer);
      clearTimeout(foregroundTimer);
      return { finishingCurrent: Boolean(active) || foregroundBusy };
    },
    async requestRefresh(input = null) {
      if (!available)
        throw new GitHubError(
          "请先配置中文模型并开启磁盘缓存与后台更新。",
          503,
        );
      await init();
      let selected = [...scopes.values()];
      if (input) {
        const normalized = normalize(input);
        const scope = scopes.get(scopeKey(normalized.q, normalized.sort));
        if (!scope)
          throw new GitHubError("没有找到这个已登记的范围，请刷新后台。", 404);
        selected = [scope];
      }
      let queued = 0,
        deferred = 0;
      for (const scope of selected)
        for (let page = 1; page <= scope.pages; page++) {
          const checked = scope.checked[page];
          // A manual update must keep upstream failure cooldowns; the saved page stays readable.
          if (checked?.error && checked.nextAt > now()) {
            deferred++;
            continue;
          }
          scope.checked[page] = { ...checked, nextAt: now() };
          queued++;
        }
      indexDirty = true;
      await saveIndex();
      wake();
      return { queued, deferred, running };
    },
    async start() {
      if (!available || running) return;
      await init();
      running = true;
      wake();
      drainForeground();
    },
    async stop() {
      running = false;
      clearTimeout(timer);
      clearTimeout(foregroundTimer);
      await active;
      await Promise.allSettled([...activePages.values()]);
      await indexWrite;
    },
    tick,
    async search(input) {
      await init();
      const { page } = normalize(input);
      const scope = ensure(input);
      await saveIndex().catch(() => {});
      wake();
      let record = await load(scope, page);
      if (record?.complete) {
        prioritize(scope, page);
        return response(record, scope);
      }
      if (page > 1 && parseDiscoveryFilter(scope.q)) {
        const first = await load(scope, 1);
        if (first?.complete) {
          prioritize(scope, page);
          if (record) return response(record, scope);
          const issue =
            scope.checked[page]?.nextAt > now()
              ? scope.checked[page]?.error
              : "";
          return {
            ...first.result,
            data: {
              ...first.result.data,
              page,
              items: [],
              cards: {},
              refresh_pending: running && !issue,
              preparation_error: issue || (!running ? "更新已暂停。" : ""),
            },
          };
        }
      }
      const preview = await filterPreview(scope, page);
      if (preview && (running || preview.data.total_count)) {
        prioritize(scope, page);
        return preview;
      }
      if (!record) {
        delete scope.checked[page];
        const raw = await github(upstreamPath(scope, page));
        raw.data.page = page;
        record = makeRecord(
          raw,
          await cards.cached((raw.data.items || []).filter(validRepo)),
        );
        await publish(scope, page, record);
      }
      prioritize(scope, page);
      return response(record, scope);
    },
    async bootstrap() {
      await init();
      const pages = await Promise.all(
        defaults
          .filter((item) => item.id !== "ranking")
          .flatMap((category) =>
            [1, 2, 3].map(async (page) => {
              const scope = ensure({ q: category.query, sort: "stars" }, true);
              const record = await load(scope, page);
              return record
                ? {
                    q: category.query,
                    sort: "stars",
                    page,
                    result: await response(record, scope),
                  }
                : null;
            }),
          ),
      );
      return { pages: pages.filter(Boolean) };
    },
    async status() {
      await init();
      return {
        enabled: available,
        running,
        current,
        persistence: store.enabled,
        refreshMs,
        scopes: await Promise.all(
          [...scopes.values()].map(async (scope) => ({
            q: scope.q,
            sort: scope.sort,
            pages: scope.pages,
            defaultScope: scope.defaultScope,
            prepared: await Promise.all(
              Array.from({ length: scope.pages }, async (_, index) => {
                const page = index + 1,
                  record = await load(scope, page);
                return {
                  page,
                  ready: record?.result.data.items.length || 0,
                  pending: record?.result.data.pending_count ?? null,
                  complete: record?.complete || false,
                  updatedAt: record?.savedAt || null,
                  ...scope.checked[page],
                };
              }),
            ),
          })),
        ),
      };
    },
    async observe(q, sort = "stars", pages = 1) {
      await init();
      ensure({ q, sort, page: pages });
      await saveIndex().catch(() => {});
      wake();
    },
  };
}
