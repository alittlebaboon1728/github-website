import type { Repository } from "./catalog";

export type GuideLink = { title: string; text: string; href: string };
export type ProjectGuide = {
  category: string;
  title: string;
  intro: string;
  paragraphs: string[];
  features: { title: string; text: string }[];
  steps: GuideLink[];
  note: string;
  preview:
    | "whiteboard"
    | "tutorials"
    | "directory"
    | "apis"
    | "courses"
    | "books"
    | "systems"
    | "roadmap"
    | "python"
    | "terminal"
    | "image";
  previewTitle: string;
  items: [string, string][];
  accent: string;
  background: string;
  image?: string;
};

// Chinese retellings of the authors' README, not quotations or endorsements.
// Every preview entry points to content present in the corresponding repository.
const guides: Record<string, ProjectGuide> = {
  "excalidraw/excalidraw": {
    category: "在线白板",
    title: "一块打开浏览器就能画的白板",
    intro:
      "我们做了一块手绘风格的在线白板。用方框、箭头和文字画流程图、产品草图或系统结构，再把图导出，或者发给同事一起编辑。",
    paragraphs: [
      "我们想把画图这件事做得像拿起纸笔一样简单。打开 Excalidraw，不用先排版，也不用安装软件，选一个形状就能开始画。画布可以一直延伸，图形之间能用箭头连接，也能放进图片和文字。",
      "画完后，你可以导出 PNG 或 SVG，放进文档和演示里；也可以保存 .excalidraw 文件，之后接着改。官网支持实时协作和端到端加密，本地画稿会自动保存在浏览器里。",
      "如果你在开发自己的产品，我们也提供 React 组件包，可以把同样的编辑器嵌入应用。官网的协作能力需要单独集成，并不是安装组件包就自动拥有。",
    ],
    features: [
      {
        title: "先把结构画出来",
        text: "用矩形、菱形、箭头和文字画流程、线框图或架构图。",
      },
      {
        title: "把文件带走",
        text: "导出 PNG、SVG，或保存可以继续编辑的 .excalidraw 文件。",
      },
      {
        title: "在官网一起编辑",
        text: "分享协作房间链接，让其他人加入同一张画布。",
      },
    ],
    steps: [
      {
        title: "打开白板",
        text: "直接打开官网，选矩形工具，在画布上拖出第一个方框。",
        href: "https://excalidraw.com",
      },
      {
        title: "连成一张图",
        text: "双击写入文字，用箭头连接两个图形。",
        href: "https://docs.excalidraw.com",
      },
      {
        title: "保存或嵌入应用",
        text: "下载画稿；开发者可以安装官方 React 组件。",
        href: "https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration",
      },
    ],
    note: "本站下方提供单人编辑器；需要多人协作时，请使用 Excalidraw 官网。",
    preview: "whiteboard",
    previewTitle: "画布示例",
    items: [],
    accent: "#6455bd",
    background: "#ebe8f5",
  },
  "codecrafters-io/build-your-own-x": {
    category: "动手教程",
    title: "从零实现数据库、编译器和操作系统",
    intro:
      "我们把从零实现各种技术的教程放在了一起。选一个你想弄懂的东西，比如数据库、Git 或编译器，跟着具体教程写一个出来。",
    paragraphs: [
      "我们收集了分步骤的教程，带你重新实现平时在用的技术。这里有数据库、操作系统、网络协议栈、3D 渲染器，也有编程语言和搜索引擎。每个主题下面都列出了教程使用的语言和原文链接。",
      "你不需要从头读完整份列表。先挑一个感兴趣的主题，再选择适合自己的语言和难度，跟着做一个最小版本。遇到看不懂的部分，再回头补相关知识。",
      "这个仓库本身是一份教程目录。具体的代码和教学内容由各链接的作者维护，阅读前可以先看看教程的前置要求和更新时间。",
    ],
    features: [
      {
        title: "按想造的东西找",
        text: "数据库、Docker、Git、浏览器、游戏引擎等主题分别整理。",
      },
      {
        title: "先看自己会的语言",
        text: "教程条目标明 C、Python、JavaScript 等实现语言。",
      },
      {
        title: "边写边理解",
        text: "跟随教程实现关键部件，理解现成工具的工作方式。",
      },
    ],
    steps: [
      {
        title: "选一个主题",
        text: "从目录进入 Database、Git 或其他感兴趣的章节。",
        href: "https://github.com/codecrafters-io/build-your-own-x#build-your-own-database",
      },
      {
        title: "选一篇教程",
        text: "根据实现语言和前置知识，打开对应作者的教程。",
        href: "https://github.com/codecrafters-io/build-your-own-x#tutorials",
      },
      {
        title: "照着写一个最小版本",
        text: "先跑通教程，再自己修改功能，确认你理解了实现。",
        href: "https://github.com/codecrafters-io/build-your-own-x",
      },
    ],
    note: "这是教程合集，不是安装后即可使用的软件。不同教程的语言、难度和维护情况不同。",
    preview: "tutorials",
    previewTitle: "README 教程目录",
    items: [
      ["Database", "从零写一个数据库"],
      ["Programming Language", "做一门编程语言"],
      ["Web Server", "实现一个 Web 服务器"],
      ["Git", "了解版本控制怎么工作"],
    ],
    accent: "#b34d35",
    background: "#f5e9e3",
  },
  "sindresorhus/awesome": {
    category: "资源索引",
    title: "按主题整理的精选资源入口",
    intro:
      "我们维护的是一份资源清单的索引。想找某个语言、工具或领域的好资料，可以先找到主题，再进入对应社区维护的精选列表。",
    paragraphs: [
      "Awesome 把各个社区维护的精选资源列表放在一起。你可以从平台、编程语言、前端、后端、计算机科学等分类进入，找到更具体的工具、文章或学习资料。",
      "这里的每个链接通常会带你去另一份 Awesome 列表。到了具体列表后，再按自己的任务找合适的资源，而不是在一个大仓库里翻所有项目。",
      "我们为收录列表提供规范，也鼓励维护者定期整理。具体资源是否适合当前项目，仍然需要查看它本身的文档、许可和更新情况。",
    ],
    features: [
      { title: "先找领域", text: "从平台、语言和开发方向等分类进入。" },
      { title: "进入专题列表", text: "每份列表都有自己的维护者和收录范围。" },
      { title: "发现工具和资料", text: "既包括软件，也包括文章、书籍和课程。" },
    ],
    steps: [
      {
        title: "打开主题目录",
        text: "浏览 Contents，先选一个你正在研究的领域。",
        href: "https://github.com/sindresorhus/awesome#contents",
      },
      {
        title: "进入具体列表",
        text: "例如 Python、Selfhosted 或 Front-End Development。",
        href: "https://github.com/sindresorhus/awesome#programming-languages",
      },
      {
        title: "阅读项目自己的文档",
        text: "找到候选工具后，再确认功能和使用要求。",
        href: "https://github.com/sindresorhus/awesome",
      },
    ],
    note: "这是资源列表的索引，没有独立应用，也不需要安装。",
    preview: "directory",
    previewTitle: "README 主题目录",
    items: [
      ["Platforms", "平台与操作系统"],
      ["Programming Languages", "编程语言"],
      ["Front-End Development", "前端开发"],
      ["Computer Science", "计算机科学"],
    ],
    accent: "#755aa7",
    background: "#eee8f3",
  },
  "public-apis/public-apis": {
    category: "API 合集",
    title: "找接口前，先看看它要不要密钥",
    intro:
      "我们按用途整理公开 API，并列出认证方式、HTTPS 和跨域支持。你可以先找数据类型，再去接口的官方文档确认调用方法和额度。",
    paragraphs: [
      "做应用时，你可能需要天气、动物、金融或地图数据。我们把公开 API 按主题整理成表格，让你先看到接口提供什么，再决定是否接入。",
      "每行会列出说明、认证方式、是否支持 HTTPS 和 CORS。Auth 一栏可以帮助你判断要不要申请密钥；CORS 则关系到能不能直接从网页请求。",
      "这些接口由各自的服务商运营，公开不等于没有调用限制。真正接入前，请打开官方文档，确认价格、配额、可用地区和使用条款。",
    ],
    features: [
      {
        title: "按数据类型浏览",
        text: "动物、天气、金融、开发等类别分别整理。",
      },
      { title: "先检查调用条件", text: "表格展示 Auth、HTTPS 和 CORS。" },
      {
        title: "链接到官方文档",
        text: "具体参数和额度以接口提供方的说明为准。",
      },
    ],
    steps: [
      {
        title: "选一个分类",
        text: "从 Index 中找到应用需要的数据类型。",
        href: "https://github.com/public-apis/public-apis#index",
      },
      {
        title: "检查 Auth 和 CORS",
        text: "确认是否需要 API key，以及能否在浏览器调用。",
        href: "https://github.com/public-apis/public-apis#animals",
      },
      {
        title: "阅读接口文档",
        text: "申请密钥、查看配额，然后发出第一次请求。",
        href: "https://github.com/public-apis/public-apis",
      },
    ],
    note: "接口状态和免费额度会变化；接入前请以服务商当前文档为准。",
    preview: "apis",
    previewTitle: "README 接口表格",
    items: [
      ["Cat Facts", "猫的知识 / 无需认证"],
      ["Dogs", "狗狗图片 / 无需认证"],
      ["Open Library", "图书信息 / 无需认证"],
    ],
    accent: "#287178",
    background: "#e2eff0",
  },
  "freecodecamp/freecodecamp": {
    category: "免费课程",
    title: "在浏览器里练习编程，做出完整项目",
    intro:
      "我们提供免费的编程课程和在线练习。你可以按自己的进度学习 HTML、JavaScript、Python 和数据库，再完成项目、参加考试，申请对应认证。",
    paragraphs: [
      "我们把课程、编码练习和项目放在一个免费学习平台里。你可以从网页开发开始，也可以选择 Python、关系型数据库、后端 API 或机器学习等方向。",
      "学习时不只是读文章。课程包含交互练习、实验、复习和测验，你会实际修改代码、完成要求。认证课程还有规定的项目和考试，达到要求后才能领取认证。",
      "这个仓库是 freeCodeCamp 网站的代码和课程内容。想直接学习，请去官网；如果想改进平台、翻译课程或修复问题，也可以参与仓库贡献。",
    ],
    features: [
      { title: "在线写代码", text: "在课程中完成编码挑战、实验和测验。" },
      { title: "按自己的节奏学", text: "课程免费，可自行安排学习进度。" },
      { title: "用项目检验学习", text: "完成认证要求的项目和考试后申请认证。" },
    ],
    steps: [
      {
        title: "进入课程目录",
        text: "从官网选择一个适合当前基础的方向。",
        href: "https://www.freecodecamp.org/learn",
      },
      {
        title: "完成交互练习",
        text: "按课程要求编写代码，通过每个小任务。",
        href: "https://www.freecodecamp.org/learn",
      },
      {
        title: "做项目和考试",
        text: "完成对应认证的全部要求。",
        href: "https://www.freecodecamp.org/learn",
      },
    ],
    note: "学习课程不需要在本机部署这个仓库；直接使用官网即可。",
    preview: "courses",
    previewTitle: "README 课程方向",
    items: [
      ["Responsive Web Design", "HTML 与 CSS"],
      ["JavaScript", "语言基础与项目"],
      ["Python", "编程练习"],
      ["Relational Databases", "SQL 与数据库"],
    ],
    accent: "#30385a",
    background: "#e8eaf2",
  },
  "ebookfoundation/free-programming-books": {
    category: "免费学习资料",
    title: "按语言和主题找免费的编程书籍",
    intro:
      "我们整理可免费阅读的编程书籍和学习资料，按自然语言与技术主题分类。找中文书、英文书、课程或练习，都可以从这里的目录开始。",
    paragraphs: [
      "这份列表从社区整理的免费编程书目发展而来，现在由 Free Ebook Foundation 维护。我们把不同自然语言的书籍分开整理，方便你先找到读得懂的资料。",
      "除了书籍，仓库里还有课程、交互教程、练习和其他学习资源。你可以从语言目录进入，再按 Python、JavaScript、计算机科学等主题查找。",
      "不想在 Markdown 里搜索，也可以使用项目提供的网页和搜索站点。每份资料的版权和阅读条件由作者决定，收录在这里不代表都可以任意转载。",
    ],
    features: [
      {
        title: "按阅读语言选",
        text: "先选中文、英文等自然语言，再看技术主题。",
      },
      { title: "不只有书", text: "也整理课程、交互教程和练习。" },
      { title: "可用网页搜索", text: "项目提供独立的搜索和浏览站点。" },
    ],
    steps: [
      {
        title: "打开搜索站",
        text: "按书名、作者或技术关键词查找。",
        href: "https://ebookfoundation.github.io/free-programming-books-search/",
      },
      {
        title: "按语言浏览",
        text: "从目录进入自己熟悉的阅读语言。",
        href: "https://github.com/EbookFoundation/free-programming-books#books",
      },
      {
        title: "前往原始资料",
        text: "打开书籍链接，确认阅读方式和许可。",
        href: "https://ebookfoundation.github.io/free-programming-books/",
      },
    ],
    note: "这是资料目录。部分条目是网页阅读，不一定提供 PDF 下载。",
    preview: "books",
    previewTitle: "仓库分类节选",
    items: [
      ["中文书籍", "按技术主题浏览"],
      ["English books", "按语言查找书目"],
      ["Free courses", "课程与教程"],
      ["Problem sets", "练习与题目"],
    ],
    accent: "#9a612d",
    background: "#f2eadd",
  },
  "donnemartin/system-design-primer": {
    category: "系统设计",
    title: "从基础概念，到完整系统设计案例",
    intro:
      "我把学习大规模系统设计需要的资料整理在这里。你可以先学缓存、负载均衡和数据库，再做设计题，对照示例方案检查自己的取舍。",
    paragraphs: [
      "系统设计的资料散落在很多地方，我把它们整理成一份可持续更新的学习指南。内容从性能、可用性和扩展性等基础概念开始，逐步讲到网络、缓存、数据库和服务架构。",
      "如果你在准备系统设计面试，可以按学习计划复习，也可以直接做常见设计题。题目附有讨论、图示和参考方案，方便比较不同设计的优缺点。",
      "仓库还提供 Anki 记忆卡片。它们适合复习关键概念，但设计题通常没有唯一答案，重要的是说明约束、估算规模，再解释为什么这样选。",
    ],
    features: [
      { title: "理解基础部件", text: "学习负载均衡、缓存、数据库和异步处理。" },
      { title: "练习设计题", text: "对照文字、架构图和代码示例复盘。" },
      { title: "复习关键概念", text: "用仓库提供的 Anki 卡片巩固知识。" },
    ],
    steps: [
      {
        title: "看学习计划",
        text: "按自己的时间和基础决定复习范围。",
        href: "https://github.com/donnemartin/system-design-primer#study-guide",
      },
      {
        title: "先做一道设计题",
        text: "独立列出需求和约束，再画出方案。",
        href: "https://github.com/donnemartin/system-design-primer#system-design-interview-questions-with-solutions",
      },
      {
        title: "对照参考方案",
        text: "检查瓶颈、容量估算和取舍是否合理。",
        href: "https://github.com/donnemartin/system-design-primer",
      },
    ],
    note: "这是学习资料和案例集，不是一套可以直接部署的系统。",
    preview: "systems",
    previewTitle: "README 学习目录",
    items: [
      ["Load balancing", "负载均衡"],
      ["Caching", "缓存与失效策略"],
      ["Database", "数据库与扩展"],
      ["System design exercises", "设计题与参考方案"],
    ],
    accent: "#3b718e",
    background: "#e5edf2",
  },
  "jwasham/coding-interview-university": {
    category: "面试学习计划",
    title: "我准备软件工程师面试时用的学习清单",
    intro:
      "这最初是我为了成为软件工程师写的学习清单，后来逐渐补成了完整计划。我把数据结构、算法、计算机基础和练习资料都放在这里，方便你按项复习。",
    paragraphs: [
      "我最开始只是想列出需要学习的知识点，准备软件工程师面试。清单越写越长，最后包含了数据结构、算法、计算机组成、操作系统和网络等内容。",
      "你可以把它当作一份待办清单，按主题选择书籍、视频和练习。我也写下了学习方法和自己浪费过时间的地方，不建议机械地照搬我当时每天的学习时长。",
      "这些资料主要面向软件工程师技术面试。先确定自己的基础和目标，再删掉暂时不需要的内容，边实现数据结构、做题，边检查掌握情况。",
    ],
    features: [
      { title: "清单式学习", text: "按主题逐项复习，而不是随机看资料。" },
      { title: "搭配具体资源", text: "每个部分列出视频、书籍或练习。" },
      { title: "记录学习方法", text: "包括作者的学习经验和时间分配建议。" },
    ],
    steps: [
      {
        title: "读使用说明",
        text: "先了解这份清单的目标和建议学法。",
        href: "https://github.com/jwasham/coding-interview-university#how-to-use-it",
      },
      {
        title: "挑选学习语言",
        text: "选一门用于实现算法和面试的语言。",
        href: "https://github.com/jwasham/coding-interview-university#pick-a-language-for-the-interview",
      },
      {
        title: "按主题练习",
        text: "自己实现、做题，再勾选已掌握的内容。",
        href: "https://github.com/jwasham/coding-interview-university",
      },
    ],
    note: "作者的学习经历仅供参考，完成清单不等于获得工作保证。",
    preview: "roadmap",
    previewTitle: "README 学习清单",
    items: [
      ["Algorithmic complexity", "算法复杂度"],
      ["Data structures", "数据结构"],
      ["Sorting & searching", "排序与搜索"],
      ["Operating systems", "操作系统"],
    ],
    accent: "#3e7565",
    background: "#e3eee8",
  },
  "awesome-selfhosted/awesome-selfhosted": {
    category: "自托管目录",
    title: "把常用应用，部署在自己的服务器上",
    intro:
      "我们按用途整理可以自行部署的网络服务和网页应用。想搭建笔记、文件同步、相册或自动化服务时，可以先来这里比较候选项目。",
    paragraphs: [
      "自托管就是在自己的服务器上运行和管理应用。我们把可以这样部署的自由软件按用途分类，涵盖文件管理、通讯、自动化、书签、博客等方向。",
      "条目会附上项目说明及相关资料，方便你进一步查看许可证、使用语言和部署方式。我们也提供更适合浏览的 HTML 版本。",
      "这份目录不负责替你安装或维护软件。选好应用后，还需要按它自己的文档部署，并考虑数据备份、升级、安全和服务器成本。",
    ],
    features: [
      { title: "按用途找替代品", text: "文件、通讯、自动化等场景分别分类。" },
      { title: "查看部署候选", text: "进入项目文档了解安装要求和许可。" },
      { title: "网页版本更好找", text: "维护者推荐使用 HTML 版本浏览目录。" },
    ],
    steps: [
      {
        title: "打开网页版目录",
        text: "先选择想要自行管理的服务类型。",
        href: "https://awesome-selfhosted.net/",
      },
      {
        title: "比较几个项目",
        text: "检查功能、安装要求和维护情况。",
        href: "https://awesome-selfhosted.net/",
      },
      {
        title: "按项目文档部署",
        text: "确认服务器资源，并安排更新和备份。",
        href: "https://github.com/awesome-selfhosted/awesome-selfhosted",
      },
    ],
    note: "需要自行承担部署、更新和备份工作；它本身是一份目录。",
    preview: "directory",
    previewTitle: "README 应用分类",
    items: [
      ["Automation", "自动化"],
      ["Backup", "备份"],
      ["Bookmarks and Link Sharing", "书签管理"],
      ["File Transfer & Synchronization", "文件传输与同步"],
    ],
    accent: "#557443",
    background: "#e8eedf",
  },
  "vinta/awesome-python": {
    category: "Python 资源",
    title: "按要做的事，找 Python 库和框架",
    intro:
      "我把值得关注的 Python 框架、库和工具按用途整理在这里。做网站、处理数据、写命令行工具，先选分类，再看具体项目的说明。",
    paragraphs: [
      "这是一份带有维护者选择标准的 Python 工具指南。我们按 Web 开发、数据库、测试、数据处理、机器学习等主题整理项目，而不是把所有库简单堆在一起。",
      "每个条目用简短说明交代它解决什么问题，并链接到项目。你可以先比较同类工具，再阅读候选项目自己的文档和示例。",
      "项目网站还提供搜索和筛选。列表只负责帮助你找到候选项，安装兼容性、许可和版本选择需要根据自己的项目确认。",
    ],
    features: [
      { title: "按任务找库", text: "Web、数据库、测试、数据处理等分类。" },
      { title: "比较同类方案", text: "先读短说明，再进入各自文档。" },
      { title: "网站支持搜索", text: "可以使用 awesome-python.com 查找。" },
    ],
    steps: [
      {
        title: "搜索用途",
        text: "在网站搜索关键词，或从目录选择分类。",
        href: "https://awesome-python.com/",
      },
      {
        title: "打开候选项目",
        text: "查看功能、示例和维护状态。",
        href: "https://github.com/vinta/awesome-python#contents",
      },
      {
        title: "确认适用版本",
        text: "按工具本身的文档安装并验证示例。",
        href: "https://github.com/vinta/awesome-python",
      },
    ],
    note: "这是一份工具目录，不是将所有收录库打包在一起的 Python 包。",
    preview: "python",
    previewTitle: "README 分类节选",
    items: [
      ["Web Frameworks", "构建网站与服务"],
      ["Database", "数据库工具"],
      ["Testing", "测试与质量检查"],
      ["Machine Learning", "机器学习"],
    ],
    accent: "#977128",
    background: "#f1eddd",
  },
  "openclaw/openclaw": {
    category: "本地 AI 助手",
    title: "把 AI 助手连接到你常用的消息渠道",
    intro:
      "我们让 AI 助手运行在你自己的设备上。通过本地 Gateway 连接模型、工具和消息渠道，你可以从常用聊天软件里给它发送任务。",
    paragraphs: [
      "OpenClaw 的中心是运行在本地的 Gateway，它负责会话、工具和消息渠道的连接。你可以通过控制界面、命令行或聊天软件与助手交互。",
      "安装后，配置模型服务和需要接入的渠道，再通过引导完成设置。项目支持多个消息平台，也提供不同设备上的配套应用。",
      "助手能做什么取决于你接入的模型、工具和权限。初次使用时，请按官方文档完成配置，检查工具和渠道的访问范围。",
    ],
    features: [
      {
        title: "在自己的设备运行",
        text: "本地 Gateway 管理会话、工具和渠道。",
      },
      { title: "接入聊天平台", text: "按文档连接需要使用的消息渠道。" },
      { title: "选择模型和工具", text: "配置自己的模型服务与工具权限。" },
    ],
    steps: [
      {
        title: "阅读安装要求",
        text: "按当前文档选择安装方式和运行环境。",
        href: "https://docs.openclaw.ai/start/getting-started",
      },
      {
        title: "完成配置引导",
        text: "设置模型服务、Gateway 和消息渠道。",
        href: "https://docs.openclaw.ai",
      },
      {
        title: "从一个小任务开始",
        text: "检查可用工具和权限，再运行实际任务。",
        href: "https://github.com/openclaw/openclaw#quick-start",
      },
    ],
    note: "需要自行配置模型与渠道，模型服务可能产生费用。",
    preview: "terminal",
    previewTitle: "README 安装与启动",
    items: [
      ["openclaw onboard --install-daemon", "配置模型与连接方式"],
      ["openclaw gateway status", "检查本地 Gateway"],
      ["openclaw dashboard", "打开控制界面"],
    ],
    accent: "#a24a37",
    background: "#f1e5e0",
  },
  "morluto/rea": {
    category: "逆向工程工具",
    title: "让智能体读取程序、二进制和运行行为",
    intro:
      "我们把不同逆向分析工具接到同一个 MCP 接口。你可以让智能体分析原生程序、浏览器或应用的运行行为，再沿着证据继续检查实现。",
    paragraphs: [
      "REA 为智能体提供统一的逆向工程工具接口。它可以协调程序运行、调试和二进制分析，让原本分散在多个工具里的信息能在同一个工作流里使用。",
      "使用时先完成环境设置，再根据目标选择对应分析能力。README 提供安装方式、支持范围和实际分析案例，具体功能依赖本机可用的工具与目标环境。",
      "这个项目面向需要分析软件行为的开发者和研究人员。开始前应先阅读兼容性要求，确认分析目标以及需要安装的配套工具。",
    ],
    features: [
      { title: "统一 MCP 接口", text: "让智能体访问可用的逆向分析能力。" },
      {
        title: "结合静态和运行信息",
        text: "围绕二进制、应用和运行行为收集证据。",
      },
      { title: "提供实际案例", text: "参考官方 showcase 了解支持的工作流。" },
    ],
    steps: [
      {
        title: "检查支持环境",
        text: "先阅读 What you can analyze 和环境要求。",
        href: "https://github.com/morluto/rea#what-you-can-analyze",
      },
      {
        title: "运行官方设置",
        text: "按 Quick start 配置所需工具和 MCP 连接。",
        href: "https://github.com/morluto/rea#quick-start",
      },
      {
        title: "查看分析案例",
        text: "选择与目标类型对应的官方指南。",
        href: "https://rea.tools/showcase/",
      },
    ],
    note: "能力依赖本地工具和运行环境，安装前应检查官方兼容性说明。",
    preview: "image",
    previewTitle: "README 官方界面截图",
    image: "/project-media/rea.webp",
    items: [],
    accent: "#495d93",
    background: "#e7eaf3",
  },
};
guides["nilbuild/developer-roadmap"] = guides[
  "kamranahmedse/developer-roadmap"
] = {
  category: "开发学习路线",
  title: "先看清一个开发方向要学哪些内容",
  intro:
    "我们把不同开发方向的知识点整理成路线图。选择前端、后端或其他方向后，可以沿着图里的节点查看主题和学习资源。",
  paragraphs: [
    "我们希望让学习路线更容易看清。每条路线把某个开发方向的知识拆成节点，显示它们之间的关系，帮助你判断先学什么、后学什么。",
    "你可以选择角色路线，也可以围绕具体技能查找资料。路线图适合用来检查知识范围，再通过课程和实际项目把每个知识点学会。",
    "路线图是一份参考，不要求你学完所有节点才开始写项目。先根据目标挑选必要部分，在实践中回头补缺口。",
  ],
  features: [
    { title: "按方向看全貌", text: "选择适合目标岗位或技能的路线。" },
    { title: "按节点找资料", text: "从知识点进入更具体的学习资源。" },
    { title: "检查知识缺口", text: "结合实际项目调整自己的学习顺序。" },
  ],
  steps: [
    {
      title: "选一个开发方向",
      text: "先确定当前想学习的角色或技能。",
      href: "https://roadmap.sh/",
    },
    {
      title: "查看知识点",
      text: "按节点阅读说明与相关资源。",
      href: "https://roadmap.sh/",
    },
    {
      title: "配合项目练习",
      text: "用实际项目验证理解，不必一次学完所有内容。",
      href: "https://roadmap.sh/",
    },
  ],
  note: "这是社区学习参考，具体岗位要求和学习顺序会因人而异。",
  preview: "roadmap",
  previewTitle: "路线内容示例",
  items: [
    ["Frontend", "前端开发"],
    ["Backend", "后端开发"],
    ["DevOps", "部署与运维"],
    ["Full Stack", "全栈开发"],
  ],
  accent: "#376e88",
  background: "#e3edf1",
};
guides["moltbot/moltbot"] = guides["openclaw/openclaw"];

export function getProjectGuide(repo: Repository): ProjectGuide | undefined {
  return guides[repo.fullName.toLowerCase()];
}
