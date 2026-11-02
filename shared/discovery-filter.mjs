import categories from "./discovery-categories.json" with { type: "json" };

const topics = new Set(
  categories.flatMap(({ query }) =>
    query.startsWith("topic:") ? [query.slice(6)] : [],
  ),
);

// Only the visible category/language controls have local equivalents. Arbitrary
// GitHub syntax must retain its upstream semantics instead of guessing matches.
export function parseDiscoveryFilter(query) {
  let topic = "",
    language = "";
  for (const token of query.trim().split(/\s+/)) {
    if (token === "is:public") continue;
    if (token.startsWith("topic:") && !topic && topics.has(token.slice(6)))
      topic = token.slice(6);
    else if (token.startsWith("language:") && !language && token.length > 9)
      language = token.slice(9).toLowerCase();
    else return null;
  }
  return { topic, language };
}

export function selectPreparedProjects(
  entries,
  query,
  sort = "stars",
  page = 1,
) {
  const filter = parseDiscoveryFilter(query);
  if (!filter) return null;
  const matches = entries.filter(
    ({ repo, card, topics: knownTopics }) =>
      repo.private === false &&
      card &&
      (!filter.language || repo.language?.toLowerCase() === filter.language) &&
      (!filter.topic ||
        knownTopics?.includes(filter.topic) ||
        repo.topics?.some((topic) => topic.toLowerCase() === filter.topic)),
  );
  const date = (repo) => Date.parse(repo.pushed_at || "") || 0;
  matches.sort(
    (a, b) =>
      (sort === "updated" ? date(b.repo) - date(a.repo) : 0) ||
      (b.repo.stargazers_count || 0) - (a.repo.stargazers_count || 0) ||
      (a.repo.full_name < b.repo.full_name
        ? -1
        : a.repo.full_name > b.repo.full_name
          ? 1
          : 0),
  );
  return {
    total: matches.length,
    items: matches.slice((page - 1) * 12, page * 12),
  };
}

export function createPreparedProjectIndex() {
  const projects = new Map();
  return {
    ingest(query, result) {
      const filter = parseDiscoveryFilter(query);
      if (!result.data.prepared || result.data.filter_preview) return;
      for (const repo of result.data.items) {
        if (repo.private !== false) {
          projects.delete(repo.full_name);
          continue;
        }
        const card = result.data.cards?.[repo.full_name];
        if (
          card?.fullName?.toLowerCase() !== repo.full_name.toLowerCase() ||
          !/[\u3400-\u9fff]/.test(card?.summary || "")
        )
          continue;
        const previous = projects.get(repo.full_name);
        const memberships = new Set(previous?.topics || []);
        if (filter?.topic) memberships.add(filter.topic);
        projects.set(repo.full_name, {
          ...(previous &&
          Date.parse(previous.fetchedAt) > Date.parse(result.fetchedAt)
            ? previous
            : { repo, card, fetchedAt: result.fetchedAt }),
          topics: [...memberships],
        });
        if (projects.size > 3000) projects.delete(projects.keys().next().value);
      }
    },
    search(query, sort = "stars", page = 1) {
      return selectPreparedProjects([...projects.values()], query, sort, page);
    },
  };
}
