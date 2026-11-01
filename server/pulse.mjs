import { activityData } from "./activity.mjs";

const utc = (value) => {
  if (typeof value !== "string") return null;
  const date = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Number.isFinite(Date.parse(date))
    ? new Date(date).toISOString()
    : null;
};

export function normalizePulse(rows, intervals) {
  const seen = new Set();
  const events = (Array.isArray(rows) ? rows : [])
    .flatMap((row) => {
      const repo = row.repo_name;
      const occurredAt = utc(row.created_at);
      if (
        !/^[\w.-]+\/[\w.-]+$/.test(repo || "") ||
        !occurredAt ||
        !row.id ||
        seen.has(String(row.id))
      )
        return [];
      const base = `https://github.com/${repo}`;
      const number = Number(row.number);
      let type, text, url;
      if (
        [
          "PullRequestEvent",
          "PullRequestReviewEvent",
          "PullRequestReviewCommentEvent",
        ].includes(row.type) &&
        Number.isSafeInteger(number) &&
        number > 0
      ) {
        type = "pull-request";
        const action =
          row.action === "merged" ||
          (row.action === "closed" && row.pr_merged === 1)
            ? "合并"
            : row.action === "opened"
              ? "打开"
              : row.type !== "PullRequestEvent"
                ? "评审"
                : "更新";
        text = `${action} PR #${number}`;
        url = `${base}/pull/${number}`;
      } else if (
        ["IssuesEvent", "IssueCommentEvent"].includes(row.type) &&
        Number.isSafeInteger(number) &&
        number > 0
      ) {
        type = "issue";
        text = `${row.type === "IssueCommentEvent" ? "评论" : row.action === "opened" ? "打开" : "更新"}议题 #${number}`;
        url = `${base}/issues/${number}`;
      } else if (row.type === "PushEvent") {
        type = "push";
        text = "推送代码";
        url = `${base}/commits`;
      } else if (row.type === "ReleaseEvent") {
        type = "release";
        text = "发布版本";
        url = `${base}/releases`;
      } else if (row.type === "WatchEvent") {
        type = "star";
        text = "收藏仓库";
        url = base;
      } else if (row.type === "ForkEvent") {
        type = "fork";
        text = "Fork 仓库";
        url = `${base}/forks`;
      } else if (row.type === "CreateEvent") {
        type = "repository";
        text = "创建仓库或分支";
        url = base;
      } else return [];
      seen.add(String(row.id));
      return [
        {
          id: String(row.id),
          repo,
          type,
          text,
          url,
          occurredAt,
          actor:
            typeof row.actor_login === "string"
              ? row.actor_login.slice(0, 80)
              : "",
        },
      ];
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const bars = (Array.isArray(intervals) ? intervals : [])
    .flatMap((row) => {
      const at = utc(row.latest_created_at);
      const count = Number(row.cnt);
      return at && row.cnt !== null && Number.isSafeInteger(count) && count >= 0
        ? [{ at, count }]
        : [];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-13);
  return { events, bars };
}

export async function pulseData(github, store, fetchImpl = fetch) {
  try {
    const [list, intervals] = await Promise.all(
      ["events-increment-list", "events-increment-intervals"].map(
        async (query) => {
          const response = await fetchImpl(
            `https://ossinsight.io/api/q/${query}`,
            { signal: AbortSignal.timeout(10_000) },
          );
          if (!response.ok) throw new Error(`OSSInsight ${response.status}`);
          return response.json();
        },
      ),
    );
    const normalized = normalizePulse(list.data, intervals.data);
    if (!normalized.events.length || !normalized.bars.length)
      throw new Error("活动来源暂无数据");
    const fetchedAt = new Date().toISOString();
    const data = {
      ...normalized,
      fetchedAt,
      provider: "OSSInsight",
      intervalSeconds: 5,
      scope:
        "OSSInsight 公开事件样本，约延迟 5–6 分钟。柱图是每 5 秒观察到的事件数下限，包含 PR、议题、推送等，不是 commit 数或 GitHub 全量。部分事件字段缺失时链接至对应仓库栏目。",
    };
    if (store.enabled) await store.update("pulse", () => data).catch(() => {});
    return { data, source: "live", fetchedAt };
  } catch {
    const saved = await store.read("pulse").catch(() => null);
    if (saved?.events?.length)
      return {
        data: { ...saved, stale: true },
        source: "cache",
        fetchedAt: saved.fetchedAt,
      };
    const fallback = await activityData(github, store);
    return {
      ...fallback,
      data: {
        ...fallback.data,
        bars: [],
        provider: "GitHub",
        intervalSeconds: 5,
        scope: `${fallback.data.scope}。OSSInsight 暂不可用，柱图暂无数据；事件时间见每条消息。`,
      },
    };
  }
}
