import { editorial } from "./catalog";
import type { Repository } from "./catalog";

export type ProjectVisual =
  | "whiteboard"
  | "terminal"
  | "directory"
  | "api"
  | "books"
  | "learning"
  | "architecture"
  | "roadmap"
  | "dashboard"
  | "python"
  | "agent"
  | "components"
  | "database"
  | "web";
export type ProjectPresentation = {
  category: string;
  summary: string;
  visual: ProjectVisual;
  color: string;
  paper: string;
};

// Short editorial descriptions. Unlisted projects retain the author's description.
const curated: Record<string, Partial<ProjectPresentation>> = {
  "excalidraw/excalidraw": {
    category: "手绘白板",
    summary: "把想法画成流程图、线框图。",
    visual: "whiteboard",
  },
  "codecrafters-io/build-your-own-x": {
    category: "动手学习",
    summary: "从零做一个数据库、编译器或操作系统。",
    visual: "terminal",
  },
  "sindresorhus/awesome": {
    category: "资源导航",
    summary: "按主题找到值得用的开源工具与资源。",
    visual: "directory",
  },
  "public-apis/public-apis": {
    category: "API 目录",
    summary: "为你的应用，找到现成的数据接口。",
    visual: "api",
  },
  "freecodecamp/freecodecamp": {
    category: "编程学习",
    summary: "用免费课程与练习，从零开始学编程。",
    visual: "learning",
  },
  "ebookfoundation/free-programming-books": {
    category: "免费书籍",
    summary: "按语言和技术，寻找免费编程书籍。",
    visual: "books",
  },
  "donnemartin/system-design-primer": {
    category: "系统设计",
    summary: "用图解和案例，学会设计大型系统。",
    visual: "architecture",
  },
  "jwasham/coding-interview-university": {
    category: "学习路线",
    summary: "一条系统学习算法与计算机科学的路线。",
    visual: "roadmap",
  },
  "kamranahmedse/developer-roadmap": {
    category: "开发路线",
    summary: "找到适合你的技术方向与学习路线。",
    visual: "roadmap",
  },
  "nilbuild/developer-roadmap": {
    category: "开发路线",
    summary: "用路线图梳理不同开发方向的学习内容。",
    visual: "roadmap",
  },
  "awesome-selfhosted/awesome-selfhosted": {
    category: "自托管",
    summary: "发现可以部署在自己服务器上的应用。",
    visual: "dashboard",
  },
  "vinta/awesome-python": {
    category: "Python 工具",
    summary: "按用途，找到合适的 Python 库。",
    visual: "python",
  },
  "openclaw/openclaw": {
    category: "AI 助手",
    summary: "连接常用工具，让 AI 帮你处理日常任务。",
    visual: "agent",
  },
  "moltbot/moltbot": {
    category: "AI 助手",
    summary: "连接常用工具，让 AI 帮你处理日常任务。",
    visual: "agent",
  },
  "morluto/rea": {
    category: "逆向分析",
    summary: "用智能体分析应用行为与原生程序。",
    visual: "agent",
  },
};

const palettes: Record<ProjectVisual, [string, string]> = {
  whiteboard: ["#46755e", "#e5eddf"],
  terminal: ["#c6e68b", "#273f39"],
  directory: ["#6f67a8", "#e9e5f2"],
  api: ["#4d7893", "#e0edf1"],
  books: ["#ad7952", "#f0e4d5"],
  learning: ["#538870", "#e3ece5"],
  architecture: ["#a7735b", "#f2e3da"],
  roadmap: ["#657b9c", "#e1e8f0"],
  dashboard: ["#6c8962", "#e6ecdc"],
  python: ["#a18442", "#f1e9cc"],
  agent: ["#7866a0", "#e9e3f1"],
  components: ["#93765f", "#efe7de"],
  database: ["#5a8892", "#e0eaec"],
  web: ["#6b849c", "#e4eaf2"],
};

export function presentProject(repo: Repository): ProjectPresentation {
  const known = curated[repo.fullName.toLowerCase()];
  const tags = repo.tags.join(" ").toLowerCase();
  const name = repo.name.toLowerCase();
  let visual: ProjectVisual = "web";
  let category = "开源项目";
  if (
    /(^|\s)(ai|llm|artificial-intelligence|agent|agents|ai-agents|agent-skills)(\s|$)/.test(
      tags,
    )
  ) {
    visual = "agent";
    category = "AI 与智能";
  } else if (/database|sql|postgres|redis/.test(tags)) {
    visual = "database";
    category = "数据工具";
  } else if (/awesome|resources|collection/.test(tags + " " + name)) {
    visual = "directory";
    category = "资源合集";
  } else if (/api|apis/.test(tags)) {
    visual = "api";
    category = "接口工具";
  } else if (/design|ui|components|animation/.test(tags)) {
    visual = "components";
    category = "设计与界面";
  } else if (/learning|education|tutorial|course/.test(tags)) {
    visual = "learning";
    category = "学习资源";
  } else if (/cli|terminal|developer-tools|command-line/.test(tags)) {
    visual = "terminal";
    category = "开发工具";
  } else if (repo.language === "Python") {
    visual = "python";
    category = "Python 项目";
  }
  visual = known?.visual || visual;
  const [color, paper] = palettes[visual];
  return {
    category: known?.category || editorial[repo.fullName]?.label || category,
    summary:
      known?.summary || editorial[repo.fullName]?.summary || repo.description,
    visual,
    color,
    paper,
  };
}
