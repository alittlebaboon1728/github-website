import { useEffect } from "react";
import { LiquidGlassController } from "./liquidGlassController";

export function useLiquidRefraction() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(
      ".observatory-shell.discovery-edition",
    );
    if (!root || !LiquidGlassController.supported()) return;
    const controller = new LiquidGlassController(root);
    return () => controller.destroy();
  }, []);
}
