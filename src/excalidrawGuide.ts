// DeepSeek draft (2026-11-01), edited against the README and the embedded editor.
// Evidence and editorial changes: docs/EXCALIDRAW_READABILITY.md.
import {
  projectTrialSections,
  projectTrialTemplate,
} from "./projectTrialSections";
export const excalidrawGuide = {
  subtitle: projectTrialTemplate.reference.summary,
  paragraphs: [
    {
      title: projectTrialSections.introduction,
      body: projectTrialTemplate.reference.reading.introduction,
    },
    {
      title: projectTrialSections.usage,
      body: projectTrialTemplate.reference.reading.usage,
    },
    {
      title: projectTrialSections.start,
      body: "完成的图可以导出为 PNG 或 SVG 图片，放进文档和演示里。想以后接着编辑，可以保存为 .excalidraw 画稿文件。需要和别人一起画时，使用官网的多人协作功能；本站白板用于单人练习。",
    },
  ],
  steps: [
    {
      title: "打开示例",
      action:
        "点击打开白板。首次使用会看到三个图形和两条箭头；如果已有画稿，可以继续编辑，或点“载入示例”重新练习。",
    },
    {
      title: "改成自己的流程",
      action:
        "双击三处文字，分别改成“提出需求”“讨论方案”“确认结果”。选择图形并拖动调整位置；需要连接时，用箭头工具拖出连线。",
    },
    {
      title: "下载这张图",
      action:
        "检查文字和连线后，点击白板上方的“导出 SVG”。下载的图片可以插入文档；当前画稿也会自动保存在这个浏览器中。",
    },
  ],
};
