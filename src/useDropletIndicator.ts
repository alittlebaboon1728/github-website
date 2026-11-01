import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/** One interruptible glass indicator for navigation and project categories. */
export function useDropletIndicator(
  containerRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLSpanElement | null>,
  selection: string | null,
) {
  const move = useRef<(animate: boolean) => void>(() => {});

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | null = null;
    let previous: {
      element: HTMLElement;
      x: number;
      y: number;
      width: number;
      height: number;
    } | null = null;
    let disposed = false;

    const place = (animate: boolean) => {
      const element = container.querySelector<HTMLElement>(
        '[aria-current="page"], [aria-pressed="true"]',
      );
      if (!element || !container.getClientRects().length) {
        animation?.cancel();
        animation = null;
        previous = null;
        indicator.style.visibility = "hidden";
        return;
      }
      const x = element.offsetLeft,
        y = element.offsetTop;
      const width = element.offsetWidth,
        height = element.offsetHeight;
      if (
        previous?.element === element &&
        previous.x === x &&
        previous.y === y &&
        previous.width === width &&
        previous.height === height
      ) {
        if (reduced.matches) {
          animation?.cancel();
          animation = null;
        }
        return;
      }

      // Read the displayed geometry before cancelling so rapid clicks remain continuous.
      const transform = getComputedStyle(indicator).transform;
      const matrix = new DOMMatrixReadOnly(
        transform === "none" ? undefined : transform,
      );
      const oldWidth = indicator.offsetWidth,
        oldHeight = indicator.offsetHeight;
      const startX = matrix.m41 + (oldWidth - width) / 2;
      const startY = matrix.m42 + (oldHeight - height) / 2;
      const startScaleX = (oldWidth * matrix.a) / width;
      const startScaleY = (oldHeight * matrix.d) / height;
      const shouldAnimate =
        animate &&
        previous !== null &&
        previous.element !== element &&
        !reduced.matches;
      animation?.cancel();
      animation = null;
      Object.assign(indicator.style, {
        width: `${width}px`,
        height: `${height}px`,
        visibility: "visible",
        transform: `translate3d(${x}px, ${y}px, 0)`,
      });
      if (shouldAnimate) {
        const distance = Math.hypot(x - startX, y - startY);
        const stretch = Math.min(0.22, (distance / Math.max(width, 1)) * 0.1);
        const at = (t: number, sx: number, sy: number) =>
          `translate3d(${startX + (x - startX) * t}px, ${startY + (y - startY) * t}px, 0) scale(${sx}, ${sy})`;
        animation = indicator.animate(
          [
            {
              transform: at(0, startScaleX, startScaleY),
              offset: 0,
              easing: "cubic-bezier(.22,.7,.3,1)",
            },
            {
              transform: at(0.62, 1 + stretch, 1 - stretch * 0.42),
              offset: 0.42,
              easing: "cubic-bezier(.2,.6,.25,1)",
            },
            {
              transform: at(1.015, 0.97, 1.025),
              offset: 0.76,
              easing: "cubic-bezier(.2,.7,.3,1)",
            },
            { transform: at(1, 1, 1), offset: 1 },
          ],
          { duration: Math.min(560, 410 + distance * 0.3) },
        );
      }
      previous = { element, x, y, width, height };
    };
    move.current = place;
    const align = () => place(false);
    const observer = new ResizeObserver(align);
    observer.observe(container);
    container
      .querySelectorAll("a, button")
      .forEach((item) => observer.observe(item));
    reduced.addEventListener("change", align);
    void document.fonts.ready.then(() => {
      if (!disposed) align();
    });
    align();
    return () => {
      disposed = true;
      observer.disconnect();
      reduced.removeEventListener("change", align);
      animation?.cancel();
      move.current = () => {};
    };
  }, [containerRef, indicatorRef]);

  useLayoutEffect(() => {
    move.current(true);
  }, [selection]);
}
