import { readFileSync } from "node:fs";

// Deterministic visual/test responses; these do not call a model or claim live recommendations.
const repositories = JSON.parse(
  readFileSync(
    new URL("../src/repository-snapshot.json", import.meta.url),
    "utf8",
  ),
).repositories;
export const chatEnvelope = (data) => ({
  data,
  source: "live",
  fetchedAt: "2026-11-01T02:00:00Z",
});
export function chatFixture(secondTurn = false, empty = false) {
  const choices = [
    [
      "excalidraw/excalidraw",
      "手绘风格的在线白板",
      "用来画流程图、产品草稿和结构示意，适合先把想法画出来再与别人讨论。",
    ],
    [
      "codecrafters-io/build-your-own-x",
      "从零做出一个小工具",
      "跟着教程动手做数据库、命令行或其他小项目，通过实践理解技术原理。",
    ],
    [
      "public-apis/public-apis",
      "查找应用需要的公开接口",
      "按主题浏览 API 清单，给自己的原型寻找天气、地图等数据来源。",
    ],
    [
      "morluto/rea",
      "理解程序运行时的行为",
      "通过项目提供的工具分析运行过程，适合需要进一步调查程序行为的开发者。",
    ],
  ];
  const selections = choices.map(([name, purpose, reason]) => {
    const repo = repositories.find((item) => item.fullName === name);
    return {
      repo: {
        id: Number(repo.id),
        owner: { login: repo.owner, avatar_url: repo.avatar },
        name: repo.name,
        full_name: repo.fullName,
        description: repo.description,
        language: repo.language,
        stargazers_count: repo.stars,
        forks_count: repo.forks,
        pushed_at: repo.updated,
        topics: repo.tags,
        html_url: repo.url,
        homepage: repo.homepage,
        license: { spdx_id: repo.license },
        default_branch: repo.defaultBranch,
        created_at: repo.createdAt,
        open_issues_count: repo.openIssues,
        archived: false,
        private: false,
      },
      purpose,
      reason,
      evidence:
        "Fixture excerpt for interface verification. Not a live recommendation.",
      checks: [
        {
          id: "open",
          label: "开源",
          level: "must",
          status: "met",
          quote: "Fixture open source project evidence.",
        },
        {
          id: "local",
          label: "本地使用",
          level: "prefer",
          status: "unknown",
          quote: null,
        },
      ],
      limitations: [
        { text: "实际使用条件请核对项目 README。", unknown: true, quote: null },
      ],
      sourceUrl: `${repo.url}#readme`,
      fetchedAt: "2026-11-01T02:00:00Z",
      source: "live",
    };
  });
  return {
    plan: {
      summary: secondTurn
        ? "这次优先考虑容易上手、能在本地使用的选择。"
        : "我挑了几种适合把想法落地的开源工具。",
      constraints: [
        { id: "open", label: "开源", level: "must" },
        { id: "local", label: "本地使用", level: "prefer" },
      ],
      queries: ["open source tools", "developer tools"],
    },
    searched: 12,
    verified: 6,
    selections: empty ? [] : selections.slice(0, secondTurn ? 2 : 4),
  };
}
