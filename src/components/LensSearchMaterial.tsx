import { useEffect, useRef } from "react";
import { GlassRenderer, materialPresets } from "../vendor/lens/adapter.js";

/** Original Lens compositor, confined to the search surface's small canvas. */
export default function LensSearchMaterial() {
  const stage = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!stage.current || !canvas.current) return;
    let renderer: GlassRenderer;
    try {
      renderer = new GlassRenderer(canvas.current, stage.current, {
        ...materialPresets.thick,
        motion: false,
        brightness: 1,
        artwork: (
          context: CanvasRenderingContext2D,
          { width, height }: { width: number; height: number },
        ) => {
          const dark = document.documentElement.dataset.theme === "dark";
          const wash = context.createLinearGradient(0, 0, width, height);
          wash.addColorStop(0, dark ? "#39453f" : "#f0f5ed");
          wash.addColorStop(0.45, dark ? "#263a33" : "#e0ece7");
          wash.addColorStop(1, dark ? "#454337" : "#f3e9d6");
          context.fillStyle = wash;
          context.fillRect(0, 0, width, height);
        },
      });
    } catch {
      return;
    }
    const theme = new MutationObserver(() => renderer.setScene("aurora"));
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const form = stage.current.closest("form");
    const surface = stage.current;
    const respond = (event: PointerEvent) => {
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: false,
        }),
      );
    };
    form?.addEventListener("pointermove", respond, { passive: true });
    return () => {
      theme.disconnect();
      form?.removeEventListener("pointermove", respond);
      renderer.destroy();
    };
  }, []);
  return (
    <span
      ref={stage}
      className="lens-search-material lg-stage"
      aria-hidden="true"
    >
      <canvas ref={canvas} className="lg-canvas" />
      <span className="lg-surface lens-search-optic" data-glass="lens" />
    </span>
  );
}
