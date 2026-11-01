const DAY = 86_400_000;
export function rankingQuery(
  { kind = "stars", language = "", topic = "" } = {},
  now = new Date(),
) {
  if (!["stars", "new"].includes(kind)) throw new Error("invalid-ranking");
  if (
    language &&
    ![
      "TypeScript",
      "JavaScript",
      "Python",
      "Go",
      "Rust",
      "Java",
      "C++",
    ].includes(language)
  )
    throw new Error("invalid-language");
  if (
    topic &&
    ![
      "developer-tools",
      "artificial-intelligence",
      "database",
      "design-tools",
    ].includes(topic)
  )
    throw new Error("invalid-topic");
  return [
    "is:public archived:false",
    kind === "new"
      ? `created:>=${new Date(+now - 30 * DAY).toISOString().slice(0, 10)}`
      : "stars:>1000",
    language && `language:${language}`,
    topic && `topic:${topic}`,
  ]
    .filter(Boolean)
    .join(" ");
}
export async function recordSnapshot(store, scope, repositories, fetchedAt) {
  if (!store.enabled)
    return {
      enabled: false,
      reason: "未配置持久化，增长趋势不可用。",
      snapshots: [],
    };
  try {
    const history = await store.update("star-history", (previous) => {
      const records = previous || {};
      for (const [key, value] of Object.entries(records))
        if (
          !value.length ||
          Date.parse(fetchedAt) - Date.parse(value.at(-1).at) > 95 * DAY
        )
          delete records[key];
      const snapshots = records[scope] || [];
      const day = fetchedAt.slice(0, 10);
      // One observation per UTC day; revisiting never manufactures a new daily baseline.
      if (!snapshots.some((snapshot) => snapshot.at.slice(0, 10) === day))
        snapshots.push({
          at: fetchedAt,
          repositories: repositories.map((r) => ({
            id: r.id,
            fullName: r.full_name,
            stars: r.stargazers_count,
          })),
        });
      records[scope] = snapshots.filter(
        (s) => Date.parse(fetchedAt) - Date.parse(s.at) <= 95 * DAY,
      );
      return records;
    });
    return { enabled: true, snapshots: history[scope] };
  } catch {
    return {
      enabled: false,
      reason: "快照写入失败，请检查数据目录权限。",
      snapshots: [],
    };
  }
}
export function calculateGrowth(
  snapshots,
  repositories,
  windowDays,
  now = Date.now(),
) {
  const target = now - windowDays * DAY;
  const baseline = [...snapshots]
    .filter((s) => Date.parse(s.at) <= target)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  // Reject an excessively stale baseline; label actual start/end rather than invent daily values.
  if (!baseline || target - Date.parse(baseline.at) > 2 * DAY)
    return { ready: false, items: [], startedAt: snapshots[0]?.at || null };
  const previous = new Map(
    baseline.repositories.map((repo) => [repo.id, repo]),
  );
  const items = repositories
    .flatMap((repo) =>
      previous.has(repo.id)
        ? [
            {
              repo,
              delta: repo.stargazers_count - previous.get(repo.id).stars,
              points: [
                ...snapshots
                  .filter(
                    (s) =>
                      Date.parse(s.at) >= Date.parse(baseline.at) &&
                      Date.parse(s.at) < now,
                  )
                  .flatMap((s) => {
                    const observation = s.repositories.find(
                      (r) => r.id === repo.id,
                    );
                    return observation
                      ? [{ at: s.at, stars: observation.stars }]
                      : [];
                  }),
                {
                  at: new Date(now).toISOString(),
                  stars: repo.stargazers_count,
                },
              ],
            },
          ]
        : [],
    )
    .sort((a, b) => b.delta - a.delta);
  return {
    ready: items.length > 0,
    items,
    from: baseline.at,
    to: new Date(now).toISOString(),
    startedAt: snapshots[0]?.at || null,
  };
}
