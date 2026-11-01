export const materialPresets: Record<"thick" | "clear" | "soft", { refraction: number; blur: number; dispersion: number }>;
export class GlassRenderer {
  constructor(canvas: HTMLCanvasElement, stage: HTMLElement, options?: Record<string, unknown>);
  invalidate(duration?: number): void;
  setScene(scene: string): void;
  destroy(): void;
}
export class JellyController {
  constructor(stage: HTMLElement, renderer?: GlassRenderer, options?: { intensity?: number });
  bodies: Map<HTMLElement, unknown>;
  reduced: boolean;
  register(element: HTMLElement, options: { mode: "press" }): unknown;
  grab(body: unknown, event: PointerEvent): void;
  cancel(snap?: boolean): void;
  destroy(): void;
}
