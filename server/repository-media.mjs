/** Images warm independently of Chinese summaries and never block search on a remote download. */
export function createRepositoryMedia(projectMedia, images) {
  const warming = new Set();
  const known = new Map();
  let timer;
  function warm(repositories) {
    for (let repo of repositories || []) {
      if (repo.private !== false || !/^[\w.-]+\/[\w.-]+$/.test(repo.full_name))
        continue;
      if (repo.owner?.avatar_url?.startsWith("/api/observatory/images/")) {
        const previous = known.get(repo.full_name);
        repo = {
          ...repo,
          owner: {
            ...repo.owner,
            avatar_url: previous?.owner?.avatar_url || "",
          },
        };
      }
      known.set(repo.full_name, repo);
      if (known.size > 2000) known.delete(known.keys().next().value);
      if (warming.has(repo.full_name)) continue;
      warming.add(repo.full_name);
      void Promise.allSettled([
        (projectMedia.prepare || projectMedia)(repo.full_name),
        repo.owner?.avatar_url
          ? images.prepare(repo.owner.avatar_url, "avatar")
          : null,
      ]).finally(() => warming.delete(repo.full_name));
    }
  }
  async function decorate(repositories) {
    warm(repositories);
    return Promise.all(
      (repositories || []).map(async (repo) => {
        if (repo.private !== false) return repo;
        const [media, avatar] = await Promise.all([
          projectMedia.cached(repo.full_name).catch(() => undefined),
          repo.owner?.avatar_url
            ? images.peek(repo.owner.avatar_url, "avatar")
            : null,
        ]);
        return {
          ...repo,
          ...(media ? { media } : {}),
          ...(avatar
            ? { owner: { ...repo.owner, avatar_url: avatar.url } }
            : {}),
        };
      }),
    );
  }
  return {
    warm,
    decorate,
    start() {
      if (!timer) {
        timer = setInterval(() => warm([...known.values()]), 60_000);
        timer.unref?.();
      }
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
