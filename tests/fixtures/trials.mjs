export const repository = {
  id: 87654,
  name: "notebook",
  full_name: "sample/notebook",
  private: false,
  description: "An offline notebook for organizing notes.",
  homepage: "https://example.com/notebook",
};
export const document = {
  data: {
    content:
      "# Notebook\nAn offline notebook for organizing notes. Create a notebook, write a note, and filter notes by tag.\nInstall with:\n```sh\nnpm install notebook\n```\n[Use online](https://example.com/notebook)\n[Documentation](https://example.com/docs)",
    html_url: "https://github.com/sample/notebook#readme",
  },
  fetchedAt: "2026-11-01T01:00:00.000Z",
};
export const content = {
  title: "把第一条灵感整理成笔记",
  summary: "一个可以离线整理笔记的工具。",
  cover: {
    layout: "workflow",
    caption: "记下想法，再按标签找到它",
    inputLabel: "写下笔记",
    input: "下周的读书计划",
    outputLabel: "整理结果",
    output: "按标签找到笔记",
  },
  reading: {
    introduction:
      "这是一个整理笔记的工具，可以把零散的想法记下来，再按标签找到需要的内容。适合保存读书摘录或工作中的灵感。",
    usage:
      "先创建笔记本，再写入笔记内容，按需要添加标签。回顾时按标签筛选，就能找到相关记录。本站示例先练习添加和查看笔记。",
  },
  audience: "想整理零散信息的人",
  goal: "写下笔记，并用标签找到它。",
  duration: "约 3 分钟",
  prerequisites: [],
  steps: [
    {
      title: "写下一条笔记",
      action: "在示例输入框中输入一条想法，点击添加笔记。",
      result: "刚才的文字出现在笔记列表中。",
    },
    {
      title: "再记录一条",
      action: "输入第二条笔记，再次添加。",
      result: "列表中有两条内容。",
    },
    {
      title: "回顾与整理",
      action: "阅读两条笔记，完成后可点击重置。",
      result: "你知道如何把想法变成可回顾的记录。",
    },
  ],
  guide: [
    { title: "打开项目", body: "通过项目给出的入口查看完整功能。" },
    {
      title: "本地安装",
      body: "按 README 继续检查环境要求后安装。",
      command: "npm install notebook",
    },
  ],
  limitations: ["这里是教学示例，不会保存到真实项目。"],
  experience: {
    kind: "interactive",
    title: "记录第一条想法",
    description: "用示例笔记体验记录与回顾的流程。",
    html: `<!doctype html><html><head><style>body{padding:24px;font:16px system-ui;background:#fafbfc;color:#202326}label{display:block;margin-bottom:12px}input{padding:12px;max-width:100%;width:100%}button{margin-top:12px;min-height:44px;padding:10px 18px;background:#28685e;color:white;border:0;border-radius:8px}li{padding:12px;overflow-wrap:anywhere}[data-theme=dark] body{background:#23262c;color:#fff}</style></head><body><label for="note">笔记内容</label><input id="note" placeholder="写下一条想法"><button id="add">添加笔记</button><ul id="notes"></ul><button id="reset">重置笔记</button><script>document.getElementById('add').onclick=()=>{const i=document.getElementById('note');if(!i.value.trim())return;const li=document.createElement('li');li.textContent=i.value;document.getElementById('notes').append(li);i.value=''};document.getElementById('reset').onclick=()=>document.getElementById('notes').replaceChildren();</script></body></html>`,
  },
  links: [
    { label: "打开项目", url: "https://example.com/notebook", kind: "app" },
    { label: "阅读文档", url: "https://example.com/docs", kind: "docs" },
  ],
  evidence: [
    "An offline notebook for organizing notes.",
    "Create a notebook, write a note, and filter notes by tag.",
  ],
};
export const trial = {
  ...content,
  version: 1,
  repo: repository.full_name,
  name: repository.name,
  model: "gpt-6.1-sol",
  generatedAt: "2026-11-01T04:00:00.000Z",
  sourceAt: document.fetchedAt,
  sourceUrl: "https://github.com/sample/notebook#readme",
};
export const ready = {
  configured: true,
  model: trial.model,
  persistence: true,
  trial,
  job: null,
};
export const catalog = {
  configured: true,
  model: trial.model,
  persistence: true,
  trials: [{ ...trial, kind: trial.experience.kind }],
  jobs: [],
};
