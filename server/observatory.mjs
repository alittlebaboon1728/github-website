import { GitHubError } from "./github.mjs";
import { createGitHubClient } from "./github-client.mjs";
import { createCache, createStore } from "./storage.mjs";
import { activityData } from "./activity.mjs";
import { pulseData } from "./pulse.mjs";
import { createCardService, readPublicReadme } from "./cards.mjs";
import { createProjectMedia } from "./project-media.mjs";
import { createImageCache } from "./image-cache.mjs";
import { createRepositoryMedia } from "./repository-media.mjs";
import { readAnonymousProject } from "./project-readme.mjs";
import { createTrialModel } from "./trial-model.mjs";
import { createTrialService } from "./trials.mjs";
import { createTrialHandler } from "./trial-http.mjs";
import { concurrencySetting } from "./task-queue.mjs";
import { createDiscoveryLibrary } from "./discovery-library.mjs";
import { createAdminHandler } from "./admin.mjs";
import { createRecommendationJobs } from "./recommend-jobs.mjs";
import { calculateGrowth, rankingQuery, recordSnapshot } from "./trends.mjs";
import {
  createModelClient,
  recommend,
  validateConversation,
} from "./recommend.mjs";

export function createObservatory(config = process.env, dependencies = {}) {
  const store =
    dependencies.store ||
    createStore(
      config.OBSERVATORY_DATA_DIR || ".data",
      config.OBSERVATORY_PERSISTENCE !== "off",
    );
  const github =
    dependencies.github ||
    createGitHubClient({
      token: config.GITHUB_TOKEN,
      fetchImpl: dependencies.fetchImpl,
      store,
    });
  const model =
    dependencies.model || createModelClient(config, dependencies.fetchImpl);
  const cached = createCache();
  const images = createImageCache(store, dependencies.fetchImpl);
  const projectMedia = createProjectMedia(
    store,
    dependencies.fetchImpl,
    github.readPage ? (name) => github.readPage(name, { priority: -20 }) : undefined,
    images,
  );
  const media = createRepositoryMedia(projectMedia, images);
  const fetchReadme =
    dependencies.readme ||
    ((repo) => readPublicReadme(repo, github, dependencies.fetchImpl));
  const cards = createCardService({
    github,
    model,
    store,
    fetchReadme,
    concurrency: concurrencySetting(config.AI_CARD_CONCURRENCY, 4),
  });
  const library = createDiscoveryLibrary({
    github, cards, store, media,
    enabled: model.configured && config.DISCOVERY_BACKGROUND === "on",
    refreshMs: Math.max(60_000, Number(config.DISCOVERY_REFRESH_MINUTES || 30) * 60_000) || 30 * 60_000,
  });
  const trialModel =
    dependencies.trialModel || createTrialModel(config, dependencies.fetchImpl);
  const adminHandler = createAdminHandler({ library, store, model, trialModel });
  const trialHandler = createTrialHandler(
    createTrialService({
      github,
      model: trialModel,
      readme: fetchReadme,
      store,
    }),
  );
  const attempts = new Map();
  const envelope = (data) => ({
    data,
    source: "live",
    fetchedAt: new Date().toISOString(),
  });
  async function recommendationMedia(data) {
    if (!Array.isArray(data.selections)) return data;
    const repos = await media.decorate(data.selections.map((selection) => selection.repo));
    return { ...data, selections: data.selections.map((selection, index) => ({ ...selection, repo: repos[index] })) };
  }
  const subscribeRecommendation = createRecommendationJobs(
    async (body, { signal, emit }) =>
      envelope(
        await recommendationMedia(await recommend(body, {
          github,
          model,
          fetchReadme,
          signal,
          concurrency: concurrencySetting(config.AI_SEARCH_CONCURRENCY, 4),
          fetchAnonymousProject: (name) =>
            readAnonymousProject(name, dependencies.fetchImpl),
          progress: (stage, message) =>
            emit({ type: "progress", stage, message }),
          partial: async (data) => emit({ type: "partial", ...envelope(await recommendationMedia(data)) }),
        })),
      ),
  );
  async function trends(params) {
    let q;
    const filters = {
      kind: params.get("kind") || "stars",
      language: params.get("language") || "",
      topic: params.get("topic") || "",
    };
    try {
      q = rankingQuery(filters);
    } catch {
      throw new GitHubError("榜单筛选条件无效。", 400);
    }
    const days = Number(params.get("days") || 7);
    if (![1, 7, 30].includes(days))
      throw new GitHubError("趋势窗口仅支持日、周、月。", 400);
    const pages = library.enabled
      ? await Promise.all([1, 2, 3].map((page) => library.search({ q, sort: "stars", page })))
      : null;
    const result = pages ? {
      ...pages[0],
      data: { ...pages[0].data, items: pages.flatMap((page) => page.data.items).slice(0, 30) },
    } : await github(
      `/search/repositories?${new URLSearchParams({ q, sort: "stars", order: "desc", per_page: "30" })}`,
    );
    const pendingCount = pages ? pages.reduce((sum, page) => sum + page.data.pending_count, 0) : 0;
    // A partially prepared ranking must not renumber rows or record an incomplete daily cohort.
    const repos = pendingCount ? [] : (result.data.items || []).filter((r) => r.private === false);
    const summaries = await cards.cached(repos);
    // New-project scope uses an absolute creation-date boundary: a rolling cohort is never compared as the same scope.
    const scope = `v1|${q}|top30-stars`;
    const history = pendingCount ? { enabled: store.enabled, snapshots: [] } : await recordSnapshot(store, scope, repos, result.fetchedAt);
    const growth = history.enabled
      ? calculateGrowth(
          history.snapshots,
          repos,
          days,
          Date.parse(result.fetchedAt),
        )
      : { ready: false, items: [] };
    return {
      ...result,
      data: {
        repositories: await media.decorate(repos),
        cards: summaries,
        prepared: library.enabled,
        pending_count: pendingCount,
        query: q,
        scope: `GitHub 搜索按总 stars 排序的前 30 个公开、未归档仓库；受搜索索引延迟影响。${result.warning || ""}`,
        total: result.data.total_count,
        incomplete: result.data.incomplete_results,
        persistence: history.enabled,
        persistenceReason: history.reason || null,
        growth: {
          ...growth,
          days,
          coverage:
            "同一查询范围的前 30 名中，起止两次都被采集的仓库；净变化 = 期末总 stars − 期初总 stars，不代表新增人数。",
        },
      },
    };
  }
  function cachedTrends(params) {
    const normalized = new URLSearchParams({
      kind: params.get("kind") || "stars",
      language: params.get("language") || "",
      topic: params.get("topic") || "",
      days: params.get("days") || "7",
    });
    return cached(`trends:${normalized}`, library.enabled ? 2000 : 300_000, () => trends(normalized));
  }
  return {
    github,
    library,
    media,
    startBackground: () => { media.start(); return library.start(); },
    stopBackground: () => { media.stop(); return library.stop(); },
    async collect() {
      return Promise.allSettled([trends(new URLSearchParams())]);
    },
    async handle(req, res) {
      if (await adminHandler(req, res)) return true;
      if (req.url?.startsWith("/api/observatory/images/")) return images.handle(req, res);
      if (!req.url?.startsWith("/api/observatory/")) return false;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (await trialHandler(req, res)) return true;
      let streaming = false;
      const send = (value) => {
        if (!res.destroyed) res.end(JSON.stringify(value));
      };
      try {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname.replace("/api/observatory", "");
        if (path === "/cards/pages" || path === "/cards/ranking") {
          if (req.method !== "POST")
            throw new GitHubError("请提交要准备的项目页。", 405);
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host)
            throw new GitHubError("不支持来自其他站点的生成请求。", 403);
          if (
            !String(req.headers["content-type"] || "").startsWith(
              "application/json",
            )
          )
            throw new GitHubError("生成请求需要 JSON。", 415);
          let bytes = 0;
          const chunks = [];
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > (path === "/cards/ranking" ? 9000 : 3000))
              throw new GitHubError("生成请求过长。", 413);
            chunks.push(chunk);
          }
          let input;
          try {
            input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            throw new GitHubError("生成请求格式无效。", 400);
          }
          if (!input || typeof input !== "object")
            throw new GitHubError("生成请求格式无效。", 400);
          let result;
          if (path === "/cards/ranking") {
            if (!model.configured)
              throw new GitHubError("中文卡片生成服务尚未配置。", 503);
            const names = input.repositories;
            if (
              !Array.isArray(names) ||
              !names.length ||
              names.length > 30 ||
              names.some(
                (name) =>
                  typeof name !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(name),
              )
            )
              throw new GitHubError("请指定当前榜单中的项目。", 400);
            const ranking = await cachedTrends(
              new URLSearchParams({
                kind: input.kind || "stars",
                language: input.language || "",
                topic: input.topic || "",
                days: input.days || "7",
              }),
            );
            const byName = new Map(
              ranking.data.repositories.map((repo) => [repo.full_name, repo]),
            );
            if (names.some((name) => !byName.has(name)))
              throw new GitHubError("榜单已更新，请刷新后重试中文总结。", 409);
            result = cards.startRanking(names.map((name) => byName.get(name)));
          } else result = cards.start(input);
          res.writeHead(202);
          send(envelope(result));
          return true;
        }
        if (path === "/recommend") {
          if (req.method !== "POST")
            throw new GitHubError("请提交需求后再进行 AI 检索。", 405);
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host)
            throw new GitHubError("不支持来自其他站点的模型请求。", 403);
          if (
            !String(req.headers["content-type"] || "").startsWith(
              "application/json",
            )
          )
            throw new GitHubError("需求格式需要为 JSON。", 415);
          if (!model.configured)
            throw new GitHubError(
              "AI 搜索尚未配置。你可以切换到普通 GitHub 搜索。",
              503,
            );
          const address = req.socket.remoteAddress || "local";
          const previous = attempts.get(address);
          const attempt =
            previous && Date.now() - previous.at < 60_000
              ? previous
              : { at: Date.now(), count: 0 };
          if (attempt.count >= 4)
            throw new GitHubError("AI 检索较频繁，请一分钟后重试。", 429);
          if (attempts.size >= 500)
            attempts.delete(attempts.keys().next().value);
          attempts.set(address, attempt);
          attempt.count++;
          let bytes = 0;
          const chunks = [];
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 12000)
              throw new GitHubError("需求过长，请缩短后重试。", 413);
            chunks.push(chunk);
          }
          let body;
          try {
            body = validateConversation(
              JSON.parse(Buffer.concat(chunks).toString("utf8")),
            );
          } catch (error) {
            if (error instanceof GitHubError) throw error;
            throw new GitHubError("需求格式无效。", 400);
          }
          const buffered = [];
          const emit = (value) => {
            if (!streaming) {
              buffered.push(value);
              return;
            }
            if (!res.destroyed) res.write(`${JSON.stringify(value)}\n`);
          };
          const subscription = subscribeRecommendation(body, emit);
          res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          res.setHeader("X-Accel-Buffering", "no");
          res.writeHead(200);
          streaming = true;
          emit({
            type: "progress",
            stage: "start",
            message: "请求已收到，正在准备检索或读取近期缓存…",
          });
          for (const event of buffered) emit(event);
          res.once("close", subscription.release);
          try {
            const result = await subscription.promise;
            emit({ type: "result", ...result });
            res.end();
          } finally {
            res.off("close", subscription.release);
            subscription.release();
          }
          return true;
        }
        if (req.method !== "GET")
          throw new GitHubError("这个接口只接受读取请求。", 405);
        let result;
        if (path === "/status")
          result = envelope({
            aiConfigured: model.configured,
            cardGeneration: model.configured,
            discoveryBackground: library.enabled,
            model: model.name,
            persistence: store.enabled,
            trialGeneration: trialModel.configured,
            trialModel: trialModel.name,
          });
        else if (path === "/catalog") result = envelope(library.enabled ? await library.bootstrap() : { pages: [] });
        else if (path === "/library/status") result = envelope(await library.status());
        else if (/^\/cards\/jobs\/[a-f0-9]{32}$/.test(path))
          result = envelope(cards.get(path.split("/").at(-1)));
        else if (path === "/project-media")
          result = envelope(await projectMedia(url.searchParams.get("repo")));
        else if (path === "/activity")
          result = await cached("activity", 120_000, () =>
            activityData(github, store),
          );
        else if (path === "/pulse")
          result = await cached("pulse", 60_000, () =>
            pulseData(github, store, dependencies.fetchImpl),
          );
        else if (path === "/trends")
          result = await cachedTrends(url.searchParams);
        else throw new GitHubError("没有找到这个数据接口。", 404);
        res.writeHead(200);
        send(result);
      } catch (error) {
        const known = error instanceof GitHubError;
        const value = {
          error: known ? error.message : "内容服务暂时不可用，请稍后重试。",
          resetAt: known ? error.resetAt : null,
        };
        if (streaming) {
          if (!res.destroyed)
            res.end(`${JSON.stringify({ type: "error", ...value })}\n`);
        } else {
          res.writeHead(known ? error.status : 500);
          send(value);
        }
      }
      return true;
    },
  };
}
