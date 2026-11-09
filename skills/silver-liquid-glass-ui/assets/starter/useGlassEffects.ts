import { useEffect } from "react";
import type { RefObject } from "react";
import { LiquidGlassController } from "./LiquidGlassController.js";

/** Static viewport optics and one demand-driven pointer light pass. */
export function useGlassEffects(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = LiquidGlassController.supported()
      ? new LiquidGlassController(root)
      : null;
    const enabled = matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (prefers-reduced-transparency: no-preference)",
    );
    let frame = 0;
    let point: { target: Element; x: number; y: number } | null = null;
    let lit = new Set<HTMLElement>();
    const reset = (element: HTMLElement) => {
      element.style.removeProperty("--glint-x");
      element.style.removeProperty("--glint-y");
    };
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      point = null;
      lit.forEach(reset);
      lit.clear();
    };
    const paint = () => {
      frame = 0;
      if (!point || !enabled.matches) return;
      const next = new Set<HTMLElement>();
      for (const selector of ["[data-glass-control]", "[data-glass-surface]"]) {
        const element = point.target.closest<HTMLElement>(selector);
        if (
          element &&
          root.contains(element) &&
          !element.closest("[data-glass-bare], [data-glass-exclude]")
        )
          next.add(element);
      }
      for (const element of lit) if (!next.has(element)) reset(element);
      for (const element of next) {
        const rect = element.getBoundingClientRect();
        element.style.setProperty(
          "--glint-x",
          `${Math.round(point.x - rect.left)}px`,
        );
        element.style.setProperty(
          "--glint-y",
          `${Math.round(point.y - rect.top)}px`,
        );
      }
      lit = next;
    };
    const move = (event: PointerEvent) => {
      if (!enabled.matches || event.pointerType !== "mouse") return;
      if (
        !(event.target instanceof Element) ||
        event.target.closest("[data-glass-exclude]")
      )
        return clear();
      point = { target: event.target, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", clear);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", clear);
    enabled.addEventListener("change", clear);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", clear);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clear);
      enabled.removeEventListener("change", clear);
      clear();
      controller?.destroy();
    };
  }, [rootRef]);
}
