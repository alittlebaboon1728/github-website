export type EditorialReview = {
  audience: string;
  problem: string;
  verdict: string;
  likes: string[];
  limitations: string[];
  unsuitable: string;
  start: { label: string; url: string };
  sources: { label: string; url: string }[];
  date: string;
  version: string;
  method: string;
};
export const editorialReviews: Record<string, EditorialReview> = {
  "excalidraw/excalidraw": {
    audience: "需要画流程图、线框图和讨论草图的人。",
    problem: "把口头想法整理成能讨论、能分享的图。",
    verdict: "草图表达很直接；嵌入编辑器与官网的协作能力要分开看。",
    likes: [
      "无限画布配合带文字的箭头，适合把流程和关系逐步展开。",
      "支持 SVG、PNG 和开放的 .excalidraw 文件，方便导出图片或继续编辑。",
      "官网说明支持浏览器本地自动保存与离线 PWA，适合随手记录。",
    ],
    limitations: [
      "README 将实时协作、端到端加密等列在官网应用下；npm 编辑器不能被直接视为具有相同的完整服务。",
      "集成到自己的 React 应用需要另行安装、配置；本站嵌入体验没有连接协作房间。",
    ],
    unsuitable: "需要无需开发就将完整多人协作服务嵌入自己产品的场景。",
    start: { label: "先在官网画一张图", url: "https://excalidraw.com" },
    sources: [
      {
        label: "README：Features 与 Excalidraw.com",
        url: "https://github.com/excalidraw/excalidraw#readme",
      },
      {
        label: "编辑器集成文档",
        url: "https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation",
      },
    ],
    date: "2026-10-31",
    version: "README 2026/10/31 参考快照；未绑定发行版本",
    method:
      "依据文档整理；核对 README 中编辑器与官网功能的区分。未作完整产品实测。",
  },
  "public-apis/public-apis": {
    audience: "给原型或应用寻找外部数据接口的开发者。",
    problem: "按主题找到可进一步核对的公开 API。",
    verdict: "适合查找接口线索，接入前仍要逐个核对服务条款。",
    likes: [
      "按业务类别浏览接口，适合先缩小选型范围。",
      "表格提供说明、认证、HTTPS 和 CORS 等列，可以直接打开对应 API 的资料。",
    ],
    limitations: [
      "这是接口目录，数据服务由各个外部提供者运行。表格不能代替服务商的文档与当前条款。",
      "各条目认证与跨域条件不同；不能把“公开 API”理解为统一免密、无限额的接口。",
    ],
    unsuitable:
      "需要同一供应商统一保障所有目录接口的可用性、配额和协议的场景。",
    start: {
      label: "按类别阅读接口表格",
      url: "https://github.com/public-apis/public-apis#readme",
    },
    sources: [
      {
        label: "README：接口类别与 Auth / HTTPS / CORS 表格",
        url: "https://github.com/public-apis/public-apis#readme",
      },
    ],
    date: "2026-10-31",
    version: "README 2026/10/31 参考快照；目录无统一适用版本",
    method: "依据文档整理；核对目录条目及表头。未逐个调用外部 API。",
  },
  "awesome-selfhosted/awesome-selfhosted": {
    audience: "愿意自行维护服务、正在寻找自托管软件的人。",
    problem: "按用途查找可以自己部署的服务候选。",
    verdict: "适合寻找自托管候选，部署成本需要回到各项目核实。",
    likes: [
      "按用途分组，并链接到具体项目，适合从需求开始逐项筛选。",
      "目录条目包含软件说明、许可证与技术栈等线索，可以继续核对项目文档。",
    ],
    limitations: [
      "这是软件目录，没有一套适用于所有条目的统一安装流程。",
      "项目使用的语言和部署方式不同；收录本身不证明你的机器、维护能力或硬件一定满足要求。",
    ],
    unsuitable: "希望直接获得一个免维护、开箱即用的统一托管服务的场景。",
    start: {
      label: "从目录选择用途分类",
      url: "https://awesome-selfhosted.net/",
    },
    sources: [
      {
        label: "README：用途分类、许可证与技术栈",
        url: "https://github.com/awesome-selfhosted/awesome-selfhosted#readme",
      },
    ],
    date: "2026-10-31",
    version: "README 2026/10/31 参考快照；未绑定目录内项目版本",
    method: "依据文档整理；核对目录结构与条目。未测试目录内服务的部署。",
  },
};
export const getEditorialReview = (fullName: string) =>
  editorialReviews[fullName.toLowerCase()];
