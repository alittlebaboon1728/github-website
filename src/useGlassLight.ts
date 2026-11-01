import { useEffect } from "react";

/** A single, demand-driven light pass. No animation loop, React state, or content transforms. */
export function useGlassLight() {
  useEffect(() => {
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
      const surfaces = new Set<HTMLElement>();
      for (const selector of [
        "button, a.button, .header-github, .site-navigation a",
        ".project-search, .site-header-inner, .trend-project-card, .gh-pulse, .ranking-row, .dialog",
      ]) {
        const element = point.target.closest<HTMLElement>(selector);
        if (
          element &&
          !element.matches(
            ".gallery-title, .trend-summary, .trend-card-cover, .ranking-project button",
          )
        )
          surfaces.add(element);
      }
      for (const element of lit) if (!surfaces.has(element)) reset(element);
      for (const element of surfaces) {
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
      lit = surfaces;
    };
    const move = (event: PointerEvent) => {
      if (!enabled.matches || event.pointerType !== "mouse") return;
      if (
        !(event.target instanceof Element) ||
        event.target.closest(".excalidraw")
      ) {
        clear();
        return;
      }
      point = { target: event.target, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", clear);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", clear);
    enabled.addEventListener("change", clear);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", clear);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clear);
      enabled.removeEventListener("change", clear);
      clear();
    };
  }, []);
}
