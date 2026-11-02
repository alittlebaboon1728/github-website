import { invalidateResources, seedResource } from "./resourceCache";
import { ApiError } from "./api";
import sandboxMaterial from "./trial-sandbox.css?raw";

export type Trial = {
  version: number;
  templateVersion?: string;
  repo: string;
  name: string;
  title: string;
  summary: string;
  reading?: { introduction: string; usage: string };
  cover?: TrialCover;
  audience: string;
  goal: string;
  duration: string;
  prerequisites: string[];
  steps: { title: string; action: string; result: string }[];
  guide: { title: string; body: string; command?: string }[];
  limitations: string[];
  experience: {
    kind: "interactive" | "flow" | "external" | "video";
    title: string;
    description: string;
    html?: string;
    url?: string;
    nodes?: { title: string; detail: string }[];
  };
  links: { label: string; url: string; kind: string }[];
  evidence: string[];
  model: string;
  generatedAt: string;
  sourceAt: string;
  sourceUrl: string;
};
export type TrialCover = {
  layout: "canvas" | "document" | "data" | "workflow";
  caption: string;
  inputLabel: string;
  input: string;
  outputLabel: string;
  output: string;
};
export type TrialSummary = Pick<
  Trial,
  "repo" | "name" | "title" | "summary" | "duration" | "generatedAt" | "model"
> & { kind: Trial["experience"]["kind"]; cover?: TrialCover };
export type TrialJob = {
  id: string;
  repo: string;
  state: "running" | "ready" | "error";
  stage: string;
  startedAt: string;
  error?: string;
};
export type TrialStatus = {
  configured: boolean;
  model: string;
  persistence: boolean;
  trial: Trial | null;
  job: TrialJob | null;
};
export type TrialCatalog = Pick<
  TrialStatus,
  "configured" | "model" | "persistence"
> & { trials: TrialSummary[]; jobs: TrialJob[] };
export const trialPath = (repo: string) =>
  `#/trial/${repo.split("/").map(encodeURIComponent).join("/")}`;
export const trialResourceKey = (repo?: string) =>
  `trials:${repo?.toLowerCase() || "catalog"}`;
export async function trialRequest<T>(
  repo?: string,
  signal?: AbortSignal,
  generate?: { regenerate?: boolean },
) {
  const response = await fetch(
    `/api/observatory/trials${repo && !generate ? `?repo=${encodeURIComponent(repo)}` : ""}`,
    {
      signal,
      ...(generate
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ repo, ...generate }),
          }
        : {}),
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(body.error || "项目试用暂时无法读取。", response.status);
  if (generate) {
    invalidateResources("trials:");
    seedResource(trialResourceKey(repo), body.data);
  }
  return body.data as T;
}

// Opaque-origin iframe. Its CSP precedes every byte of generated markup and
// denies resource loads, connections, forms, nested frames and external scripts.
export function trialDocument(
  html: string,
  dark: boolean,
  resizeToken: string,
) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed
    .querySelectorAll("meta,base,link,iframe,frame,object,embed,form")
    .forEach((el) => el.remove());
  parsed.querySelectorAll("*").forEach((el) => {
    for (const attr of [
      "href",
      "src",
      "srcset",
      "action",
      "formaction",
      "target",
      "download",
      "ping",
      "xlink:href",
    ])
      if (el.hasAttribute(attr)) el.removeAttribute(attr);
  });
  const csp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const resize = `<script>(()=>{let frame;const report=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>parent.postMessage({type:'trial-height',token:${JSON.stringify(resizeToken)},height:Math.ceil(document.body.getBoundingClientRect().height)+4},'*'))};new ResizeObserver(report).observe(document.body);report()})()</script>`;
  const host = getComputedStyle(document.documentElement);
  const tokens = [
    "--card",
    "--forest",
    "--glass-edge",
    "--glass-light",
    "--glass-specular",
    "--glass-sheen",
    "--glass-primary",
    "--glass-primary-hover",
    "--glass-control-shadow",
    "--glass-highlight",
    "--glass-lowlight",
    "--glass-blur",
  ]
    .map((name) => `${name}:${host.getPropertyValue(name)};`)
    .join("");
  const material = `<style>:root{${tokens}}${sandboxMaterial}</style>`;
  return `<!doctype html><html lang="zh-CN" data-theme="${dark ? "dark" : "light"}"><head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:${dark ? "dark" : "light"}}body{margin:0;overflow-wrap:anywhere}*{box-sizing:border-box}img,svg,canvas{max-width:100%}button,input,select,textarea{font:inherit}button{cursor:pointer}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}</style>${parsed.head.innerHTML}${material}</head><body>${parsed.body.innerHTML}${resize}</body></html>`;
}
