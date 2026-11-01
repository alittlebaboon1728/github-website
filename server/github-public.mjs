// Parse public GitHub documents as data. Never execute page scripts or use cookies.
export const validRepository = (name) =>
  typeof name === "string" &&
  /^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(name) &&
  name.split("/").every((part) => ![".", ".."].includes(part));

export function plainText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const n =
        code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16)
          : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, name) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[name],
    );
}

function payloads(html) {
  return [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].flatMap((match) => {
    try {
      const data = JSON.parse(match[1]);
      return data.payload ? [data.payload] : [];
    } catch {
      return [];
    }
  });
}

const number = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
const emptyMetadata = {
  forks_count: null,
  pushed_at: null,
  created_at: null,
  open_issues_count: null,
  homepage: null,
  license: null,
  default_branch: "HEAD",
  language: null,
  metadata_incomplete: true,
  data_provider: "github-web",
};

export function parseRepositorySearch(html, expectedPage) {
  const data = payloads(html)
    .map((p) => p.blackbirdSearchRoute || p)
    .find((p) => p.type === "repositories" && Array.isArray(p.results));
  if (
    !data ||
    data.errors?.length ||
    number(data.result_count) === null ||
    (data.page != null && data.page !== expectedPage)
  )
    throw new Error("GitHub 公开搜索页格式不可用。");
  const items = data.results.map((item) => {
    const repo = item.repo?.repository;
    const name = `${repo?.owner_login}/${repo?.name}`;
    if (
      item.public !== true ||
      !validRepository(name) ||
      !number(repo?.id) ||
      number(item.followers) === null
    )
      throw new Error("公开搜索结果缺少可靠的仓库资料。");
    return {
      ...emptyMetadata,
      id: repo.id,
      name: repo.name,
      full_name: name,
      owner: {
        login: repo.owner_login,
        avatar_url: `https://github.com/${encodeURIComponent(repo.owner_login)}.png?size=80`,
      },
      description: plainText(item.hl_trunc_description || ""),
      language: typeof item.language === "string" ? item.language : null,
      stargazers_count: item.followers,
      topics: Array.isArray(item.topics)
        ? item.topics.filter((t) => typeof t === "string")
        : [],
      html_url: `https://github.com/${name}`,
      private: false,
      archived: item.archived === true,
    };
  });
  return {
    items,
    total_count: data.result_count,
    incomplete_results: Boolean(data.warn_limited_results),
  };
}

export function parsePublicRepository(html, fullName) {
  if (!validRepository(fullName)) throw new Error("invalid-repository");
  const meta = (name) =>
    html
      .match(new RegExp(`<meta\\b[^>]*name=["']${name}["'][^>]*>`, "i"))?.[0]
      .match(/content=["']([^"']+)["']/i)?.[1];
  if (meta("octolytics-dimension-repository_public") === "false")
    throw Object.assign(new Error("这个仓库不再公开。"), { status: 404 });
  if (
    meta("octolytics-dimension-repository_public") !== "true" ||
    meta("octolytics-dimension-repository_nwo")?.toLowerCase() !==
      fullName.toLowerCase()
  )
    throw new Error("仓库公开状态无法确认。");
  const payload = payloads(html).find((p) => p.codeViewLayoutRoute?.repo);
  const repo = payload?.codeViewLayoutRoute?.repo;
  const about = payload?.sidebarAbout;
  if (
    !repo ||
    repo.public !== true ||
    repo.private === true ||
    !about ||
    `${repo.ownerLogin}/${repo.name}`.toLowerCase() !==
      fullName.toLowerCase() ||
    !number(repo.id) ||
    number(about.stargazerCount) === null
  )
    throw new Error("GitHub 仓库页格式不可用。");
  const files = payload.codeViewRepoRoute?.overview?.overviewFiles || [];
  const readme = files.find((file) => file.preferredFileType === "readme");
  const language = html.match(
    /itemprop=["']programmingLanguage["'][^>]*>([^<]+)</i,
  )?.[1];
  return {
    data: {
      ...emptyMetadata,
      id: repo.id,
      name: repo.name,
      full_name: `${repo.ownerLogin}/${repo.name}`,
      owner: {
        login: repo.ownerLogin,
        avatar_url:
          repo.ownerAvatar ||
          `https://github.com/${repo.ownerLogin}.png?size=80`,
      },
      private: false,
      archived: repo.isArchived === true,
      description: plainText(about.description || ""),
      html_url: `https://github.com/${repo.ownerLogin}/${repo.name}`,
      homepage: about.website || null,
      language: language ? plainText(language).trim() : null,
      stargazers_count: about.stargazerCount,
      forks_count: number(about.forksCount),
      default_branch: repo.defaultBranch || "HEAD",
      created_at: date(repo.createdAt),
      topics: (about.topics || [])
        .map((t) => t.name)
        .filter((t) => typeof t === "string"),
      license: about.repo?.license?.spdxId
        ? { spdx_id: about.repo.license.spdxId }
        : null,
    },
    readme:
      readme && typeof readme.richText === "string"
        ? {
            html: readme.richText,
            path: readme.path,
          }
        : null,
  };
}

export function readmeFromHtml(html) {
  const article = html.match(
    /<article\b[^>]*class="[^"]*\bmarkdown-body\b[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
  )?.[1];
  if (!article) return "";
  return plainText(
    article
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(?:p|div|h[1-6]|li|tr)>|<br\s*\/?\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
