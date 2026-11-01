import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Download, RotateCcw, Check, MousePointer2 } from "lucide-react";
import "@excalidraw/excalidraw/index.css";
import GlassButton from "./components/GlassButton";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string;
  }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
const storageKey = "observatory-excalidraw-scene-v1";
function exampleElements() {
  const compact = window.matchMedia("(max-width: 680px)").matches;
  return convertToExcalidrawElements([
    {
      id: "idea",
      type: "rectangle",
      x: compact ? 100 : 80,
      y: compact ? 40 : 130,
      width: 170,
      height: compact ? 80 : 100,
      backgroundColor: "#e5eadb",
      strokeColor: "#75875f",
      fillStyle: "solid",
      roundness: { type: 3 },
      label: { text: "一个想法", fontSize: 23, fontFamily: 2 },
    },
    {
      id: "sketch",
      type: "rectangle",
      x: compact ? 100 : 330,
      y: compact ? 165 : 130,
      width: 170,
      height: compact ? 80 : 100,
      backgroundColor: "#f3dfca",
      strokeColor: "#b88a65",
      fillStyle: "solid",
      roundness: { type: 3 },
      label: { text: "画个草图", fontSize: 23, fontFamily: 2 },
    },
    {
      id: "together",
      type: "ellipse",
      x: compact ? 100 : 580,
      y: compact ? 290 : 130,
      width: 170,
      height: compact ? 80 : 100,
      backgroundColor: "#e8e1ee",
      strokeColor: "#9a89a9",
      fillStyle: "solid",
      label: { text: "达成共识", fontSize: 23, fontFamily: 2 },
    },
    {
      type: "arrow",
      x: compact ? 185 : 260,
      y: compact ? 128 : 180,
      width: compact ? 0 : 60,
      height: compact ? 29 : 0,
      points: [[0, 0], compact ? [0, 29] : [60, 0]],
      strokeColor: "#879775",
    },
    {
      type: "arrow",
      x: compact ? 185 : 510,
      y: compact ? 253 : 180,
      width: compact ? 0 : 60,
      height: compact ? 29 : 0,
      points: [[0, 0], compact ? [0, 29] : [60, 0]],
      strokeColor: "#879775",
    },
    {
      type: "text",
      x: compact ? 80 : 225,
      y: compact ? 400 : 285,
      text: compact
        ? "双击改文字，拖动图形。\n用箭头连接你的想法。"
        : "双击修改文字，拖动图形，或者画一条自己的线。",
      fontSize: 18,
      fontFamily: 2,
      strokeColor: "#8b947c",
    },
  ]);
}
function initialScene() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (value && Array.isArray(value.elements))
      return { ...value, scrollToContent: true };
  } catch {
    /* A fresh canvas is always available. */
  }
  return {
    elements: exampleElements(),
    appState: { viewBackgroundColor: "#ffffff" },
    scrollToContent: true,
  };
}

export default function ExcalidrawLab({
  dark,
  onNotify,
}: {
  dark: boolean;
  onNotify: (message: string) => void;
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const fitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleFit = useCallback(() => {
    clearTimeout(fitTimer.current);
    // Let the editor commit its own container measurements before fitting.
    fitTimer.current = setTimeout(() => {
      const editor = api.current;
      if (!editor) return;
      editor.scrollToContent(editor.getSceneElements(), {
        fitToContent: true,
        animate: false,
        viewportZoomFactor: 0.75,
      });
    }, 180);
  }, []);
  const attachEditor = useCallback(
    (value: ExcalidrawImperativeAPI) => {
      api.current = value;
      scheduleFit();
    },
    [scheduleFit],
  );
  useEffect(() => {
    if (!host.current) return;
    let previousWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (Math.abs(width - previousWidth) < 30) return;
      previousWidth = width;
      scheduleFit();
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      clearTimeout(fitTimer.current);
    };
  }, [scheduleFit]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pending = useRef<string | null>(null);
  const [initial] = useState(initialScene);
  const [saveStatus, setSaveStatus] = useState("图稿自动保存在本机");
  useEffect(() => {
    function flush() {
      if (pending.current) {
        try {
          localStorage.setItem(storageKey, pending.current);
          pending.current = null;
        } catch {
          /* Export remains available. */
        }
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  function change(
    elements: readonly ExcalidrawElement[],
    state: AppState,
    files: BinaryFiles,
  ) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      pending.current = JSON.stringify({
        elements,
        files,
        appState: { viewBackgroundColor: state.viewBackgroundColor },
      });
    } catch {
      setSaveStatus("本机保存失败，请导出图稿");
      return;
    }
    saveTimer.current = setTimeout(() => {
      try {
        if (pending.current) localStorage.setItem(storageKey, pending.current);
        pending.current = null;
        setSaveStatus("图稿已保存在本机");
      } catch {
        setSaveStatus("本机保存失败，请导出图稿");
      }
    }, 500);
  }
  function reset() {
    if (!api.current) return;
    const elements = exampleElements();
    api.current.updateScene({
      elements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.current.scrollToContent(elements, {
      fitToContent: true,
      animate: false,
    });
  }
  async function download() {
    if (!api.current) return;
    try {
      const svg = await exportToSvg({
        elements: api.current.getSceneElements(),
        appState: { ...api.current.getAppState(), exportBackground: true },
        files: api.current.getFiles(),
      });
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "我的第一张开源草图.svg";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onNotify("SVG 图稿已导出。");
    } catch {
      onNotify("导出暂时失败，请使用编辑器菜单中的导出功能。");
    }
  }
  return (
    <div className="real-editor">
      <div className="real-editor-actions">
        <span>
          <MousePointer2 size={13} />
          这是真正的 Excalidraw，试着拖动或双击图形。
        </span>
        <div>
          <GlassButton
            onClick={reset}
            title="替换当前画布，可用编辑器撤销操作恢复"
          >
            <RotateCcw size={13} />
            载入示例
          </GlassButton>
          <GlassButton onClick={download}>
            <Download size={13} />
            导出 SVG
          </GlassButton>
        </div>
      </div>
      <div
        ref={host}
        className="excalidraw-host"
        data-testid="excalidraw-editor"
      >
        <Excalidraw
          langCode="zh-CN"
          theme={dark ? "dark" : "light"}
          initialData={initial}
          excalidrawAPI={attachEditor}
          onChange={change}
          UIOptions={{
            canvasActions: { toggleTheme: false, saveToActiveFile: false },
          }}
        />
      </div>
      <div className="real-editor-footer">
        <span>
          <Check size={12} />
          {saveStatus}
        </span>
        <span>嵌入式绘图体验 · 不连接多人协作房间</span>
      </div>
    </div>
  );
}
