import snapshot from "./repository-snapshot.json";
import type { GeneratedCard } from "./generatedCards";

export type Repository = {
  generated?: GeneratedCard;
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string;
  language: string;
  color: string;
  stars: number;
  forks: number | null;
  updated: string | null;
  icon: "spark" | "box" | "layers" | "terminal" | "globe" | "code";
  tint: string;
  tags: string[];
  url: string;
  avatar: string;
  homepage: string;
  license: string;
  defaultBranch: string;
  createdAt: string | null;
  openIssues: number | null;
  archived: boolean;
};
export const snapshotRepos = snapshot.repositories as Repository[];
export const snapshotDate = snapshot.fetchedAt;
export const exampleRepo = snapshotRepos.find(
  (repo) => repo.fullName === "excalidraw/excalidraw",
)!;
export function hasProjectTrial(fullName: string) {
  return fullName.toLowerCase() === "excalidraw/excalidraw";
}
export const categories = [
  {
    id: "all",
    name: "全部项目",
    query: "is:public",
    icon: "compass",
  },
  {
    id: "ai",
    name: "AI 与智能",
    query: "topic:artificial-intelligence",
    icon: "spark",
  },
  {
    id: "dev",
    name: "开发者工具",
    query: "topic:developer-tools",
    icon: "terminal",
  },
  {
    id: "design",
    name: "设计与创意",
    query: "topic:design-tools",
    icon: "pen",
  },
  {
    id: "web",
    name: "网站与应用",
    query: "topic:web-application",
    icon: "globe",
  },
  {
    id: "data",
    name: "数据与后端",
    query: "topic:database",
    icon: "database",
  },
];
export const editorial: Record<
  string,
  { summary: string; audience: string; label: string }
> = {
  "excalidraw/excalidraw": {
    summary: "像拿起纸笔一样画流程图、线框图，让脑海里的想法被大家看见。",
    audience: "每一个想把想法讲清楚的人",
    label: "手绘白板",
  },
  "codecrafters-io/build-your-own-x": {
    summary: "从零动手做一个数据库、搜索引擎或编程语言，理解技术背后的原理。",
    audience: "想通过实践理解技术的开发者",
    label: "动手学习",
  },
  "sindresorhus/awesome": {
    summary: "一本开源世界的资源目录，沿着不同主题找到工具、知识与灵感。",
    audience: "正在寻找优质资源的人",
    label: "资源导航",
  },
  "public-apis/public-apis": {
    summary: "收集各类公开 API，为你的应用寻找天气、地图、金融等数据接口。",
    audience: "需要为产品接入数据的开发者",
    label: "接口目录",
  },
  "freeCodeCamp/freeCodeCamp": {
    summary: "通过免费的课程与练习，循序渐进地学习编程和计算机科学。",
    audience: "准备从零学习编程的人",
    label: "学习平台",
  },
  "EbookFoundation/free-programming-books": {
    summary: "按语言与技术主题整理免费编程书籍，让自学少一些盲目。",
    audience: "喜欢系统阅读的技术学习者",
    label: "免费书籍",
  },
  "donnemartin/system-design-primer": {
    summary: "用图解、案例与练习理解大型系统如何设计，也可用于准备面试。",
    audience: "正在学习系统设计的工程师",
    label: "系统设计",
  },
  "jwasham/coding-interview-university": {
    summary:
      "一份面向软件工程师的计算机科学学习计划，包含数据结构和算法等内容。",
    audience: "想建立计算机知识体系的人",
    label: "学习路线",
  },
  "awesome-selfhosted/awesome-selfhosted": {
    summary: "发现可以自己部署的服务和应用，搭建由自己掌控的数字工具箱。",
    audience: "对自托管服务感兴趣的人",
    label: "自托管",
  },
  "vinta/awesome-python": {
    summary: "按用途整理 Python 库与工具，帮你从“想做什么”找到“用什么做”。",
    audience: "正在寻找合适工具的 Python 开发者",
    label: "Python 工具",
  },
};
export const searchAliases: Record<string, string> = {
  白板: "whiteboard",
  画图: "drawing",
  人工智能: "artificial-intelligence",
  数据库: "database",
  设计: "design",
  视频: "video",
  笔记: "note-taking",
  爬虫: "web-scraping",
  前端: "frontend",
  学习: "learning",
  游戏: "game",
  中文: "chinese",
};
export function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "未提供";
  return value >= 10000
    ? `${(value / 10000).toFixed(1)}万`
    : value.toLocaleString("zh-CN");
}
export function relativeDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "更新时间未提供";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
  return days === 0
    ? "今天更新"
    : days === 1
      ? "昨天更新"
      : days < 30
        ? `${days} 天前更新`
        : new Date(value).toLocaleDateString("zh-CN");
}
export function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
