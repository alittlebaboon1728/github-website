export function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .flatMap((event) => {
      const repo = event.repo?.name;
      if (
        !/^[\w.-]+\/[\w.-]+$/.test(repo || "") ||
        !Number.isFinite(Date.parse(event.created_at))
      )
        return [];
      const payload = event.payload || {};
      let type, text, url;
      if (event.type === "ReleaseEvent" && payload.action === "published") {
        type = "release";
        text = `发布 ${payload.release?.tag_name || "新版本"}`;
        url = payload.release?.html_url;
      } else if (
        event.type === "PullRequestEvent" &&
        (payload.action === "merged" ||
          (payload.action === "closed" &&
            payload.pull_request?.merged === true))
      ) {
        const pr = payload.pull_request || {};
        const number = payload.number || pr.number;
        type = "pull-request";
        text = `合并 PR：${pr.title || (Number.isInteger(number) ? `#${number}` : "查看变更")}`;
        url = pr.html_url;
        if (
          !url &&
          Number.isInteger(number) &&
          pr.url === `https://api.github.com/repos/${repo}/pulls/${number}`
        )
          url = `https://github.com/${repo}/pull/${number}`;
      } else if (event.type === "IssuesEvent" && payload.action === "opened") {
        type = "issue";
        text = `新议题：${payload.issue?.title || "查看议题"}`;
        url = payload.issue?.html_url;
      } else if (
        event.type === "CreateEvent" &&
        payload.ref_type === "repository"
      ) {
        type = "repository";
        text = "创建公开仓库";
        url = `https://github.com/${repo}`;
      } else if (
        event.type === "CreateEvent" &&
        payload.ref_type === "branch" &&
        typeof payload.ref === "string" &&
        payload.ref
      ) {
        type = "branch";
        text = `创建分支 ${payload.ref}`;
        url = `https://github.com/${repo}/tree/${encodeURIComponent(payload.ref)}`;
      } else if (
        event.type === "PushEvent" &&
        /^[0-9a-f]{40}$/i.test(payload.head || "") &&
        !/^0+$/.test(payload.head)
      ) {
        type = "push";
        text = `推送代码${typeof payload.ref === "string" ? `至 ${payload.ref.replace(/^refs\/heads\//, "")}` : ""}`;
        url = `https://github.com/${repo}/commit/${payload.head}`;
      } else return [];
      try {
        const link = new URL(url);
        if (
          link.origin !== "https://github.com" ||
          (!link.pathname.startsWith(`/${repo}/`) &&
            link.pathname !== `/${repo}`)
        )
          return [];
      } catch {
        return [];
      }
      return [
        {
          id: String(event.id),
          repo,
          type,
          text: text.slice(0, 220),
          url,
          occurredAt: event.created_at,
        },
      ];
    })
    .filter(
      (event, index, array) =>
        array.findIndex((item) => item.id === event.id) === index,
    )
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export async function activityData(github, store) {
  try {
    const result = await github("/events?per_page=100");
    const data = {
      events: normalizeEvents(result.data),
      scope: "GitHub 公开事件样本（最近一页，最多 100 条原始事件）",
      fetchedAt: result.fetchedAt,
    };
    let persistence = store.enabled;
    if (persistence)
      await store
        .update("activity", () => data)
        .catch(() => {
          persistence = false;
        });
    return {
      data: { ...data, persistence },
      source: result.source,
      fetchedAt: result.fetchedAt,
    };
  } catch (error) {
    const saved = await store.read("activity").catch(() => null);
    if (!saved) throw error;
    return {
      data: { ...saved, stale: true, warning: error.message },
      source: "cache",
      fetchedAt: saved.fetchedAt,
    };
  }
}
