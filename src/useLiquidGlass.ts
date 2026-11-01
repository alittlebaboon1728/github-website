import { useEffect } from "react";
import { JellyController } from "./vendor/lens/adapter.js";

/** One delegated listener moves surface highlights without React rerenders. */
export function useLiquidGlass() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const jelly = new JellyController(document.body, undefined, {
      intensity: 0.42,
    });
    const press = (event: PointerEvent) => {
      if (
        reduced.matches ||
        !(event.target instanceof Element) ||
        event.target.closest(".excalidraw")
      )
        return;
      const control = event.target.closest<HTMLElement>(
        "button, a.button, .site-navigation a",
      );
      if (
        !control ||
        control.matches(".gallery-title, .trend-summary, .trend-card-cover") ||
        control.closest(".ranking-project")
      )
        return;
      for (const element of jelly.bodies.keys())
        if (!element.isConnected) jelly.bodies.delete(element);
      const body =
        jelly.bodies.get(control) || jelly.register(control, { mode: "press" });
      jelly.grab(body, event);
    };
    const change = () => {
      jelly.reduced = reduced.matches;
      if (reduced.matches) jelly.cancel(true);
    };
    document.addEventListener("pointerdown", press);
    reduced.addEventListener("change", change);
    const media = matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let frame = 0;
    let pointer: PointerEvent | null = null;
    function update() {
      frame = 0;
      if (!pointer || !(pointer.target instanceof Element) || !media.matches)
        return;
      if (pointer.target.closest(".excalidraw")) return;
      const surfaces = new Set([
        pointer.target.closest<HTMLElement>(
          "button, .button, .site-navigation a, .project-search, .dialog, .ranking-row, .article-row",
        ),
        pointer.target.closest<HTMLElement>(
          ".trend-project-card, .project-search, .spotlight-workbench",
        ),
      ]);
      for (const surface of surfaces) {
        if (!surface) continue;
        const bounds = surface.getBoundingClientRect();
        surface.style.setProperty(
          "--glass-x",
          `${Math.round(pointer.clientX - bounds.left)}px`,
        );
        surface.style.setProperty(
          "--glass-y",
          `${Math.round(pointer.clientY - bounds.top)}px`,
        );
      }
    }
    const move = (event: PointerEvent) => {
      pointer = event;
      if (!frame && media.matches) frame = requestAnimationFrame(update);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", press);
      reduced.removeEventListener("change", change);
      jelly.destroy();
      cancelAnimationFrame(frame);
    };
  }, []);
}
