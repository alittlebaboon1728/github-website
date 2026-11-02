import type { TrialCover, TrialSummary } from "./trials";
import referenceCovers from "../shared/trial-covers.json";

export function coverFor(trial: TrialSummary): TrialCover {
  return (
    trial.cover ||
    (referenceCovers as Record<string, TrialCover>)[
      trial.repo.toLowerCase()
    ] || {
      layout: "workflow",
      caption: trial.title,
      inputLabel: "了解项目",
      input: trial.name,
      outputLabel: "完成练习",
      output: trial.title,
    }
  );
}

type PosterStory = {
  theme: "canvas" | "document" | "data" | "chat" | "flutter" | "workflow";
  lines: [string, string];
  title: string;
  detail: string;
};

const stories: Record<string, PosterStory> = {
  "markedjs/marked": {
    theme: "document",
    lines: ["几行文字，", "就能变成网页"],
    title: "写几行 Markdown，网页就有了模样",
    detail: "从纯文本到网页排版",
  },
  "jqlang/jq": {
    theme: "data",
    lines: ["这么长的 JSON，", "只取这一行"],
    title: "一大段 JSON，只留下你要的版本号",
    detail: "试着用 .version 提取结果",
  },
  "open-webui/open-webui": {
    theme: "chat",
    lines: ["问 AI 之前，", "把资料交给它"],
    title: "把自己的资料放进对话，AI 会怎么回答？",
    detail: "带着一份上线清单提问",
  },
  "flutter/flutter": {
    theme: "flutter",
    lines: ["界面改了，", "计数还在"],
    title: "改个标题，看看热重载为什么顺手",
    detail: "动手修改，观察状态变化",
  },
};

export function trialPresentation(
  trial: TrialSummary,
  cover = coverFor(trial),
) {
  const repo = trial.repo.toLowerCase();
  const native = repo === "excalidraw/excalidraw" && !trial.model;
  const format = native
    ? "真实白板"
    : {
        interactive: "交互教学",
        flow: "流程导览",
        external: "在线体验",
        video: "项目视频",
      }[trial.kind];
  const caption = cover.caption || trial.title;
  const chunks = Array.from(caption);
  const midpoint = Math.min(9, Math.ceil(chunks.length / 2));
  const fallback: PosterStory = {
    theme: "workflow",
    lines: [
      chunks.slice(0, midpoint).join(""),
      chunks.length - midpoint > 9
        ? `${chunks.slice(midpoint, midpoint + 8).join("")}…`
        : chunks.slice(midpoint).join(""),
    ],
    title: trial.title,
    detail: `${cover.inputLabel} → ${cover.outputLabel}`,
  };
  // Regeneration can change a lesson: use its tailored scene only while
  // the actual saved input and result still match that scene's subject.
  const tailored =
    repo === "markedjs/marked"
      ? cover.layout === "document"
      : repo === "jqlang/jq"
        ? cover.layout === "data" && /version/.test(cover.input)
        : repo === "open-webui/open-webui"
          ? /上线/.test(cover.input) && /备份数据库/.test(cover.output)
          : repo === "flutter/flutter"
            ? /已完成/.test(cover.output) && /2/.test(cover.output)
            : false;
  const story: PosterStory =
    repo === "excalidraw/excalidraw" && cover.layout === "canvas"
      ? {
          theme: "canvas",
          lines: native
            ? ["想法太乱？", "画出来就懂了"]
            : ["把一个需求，", "画成一条流程"],
          title: native
            ? "把脑中的想法，画成一张图"
            : "从需求到交付，一张流程图讲清楚",
          detail: native ? "拖动、连线，再把作品带走" : "从图形和连线开始",
        }
      : (tailored && stories[repo]) || fallback;
  return { ...story, native, format };
}
