import { useLayoutEffect, useRef } from "react";
import type { HTMLAttributes } from "react";

/** Keep source/keyboard order while fitting each card to its natural height. */
export default function RepositoryGrid({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const apply = (sizes: { card: HTMLElement; height: number }[]) => {
      // Read every height before writing spans, avoiding a layout per card.
      for (const { card, height } of sizes) {
        const span = String(Math.ceil(height) + 24);
        if (card.style.getPropertyValue("--card-span") !== span)
          card.style.setProperty("--card-span", span);
      }
    };
    const observer = new ResizeObserver((entries) => {
      apply(
        entries.map((entry) => ({
          card: entry.target as HTMLElement,
          height:
            entry.borderBoxSize[0]?.blockSize ??
            entry.target.getBoundingClientRect().height,
        })),
      );
    });
    const cards = Array.from(element.children) as HTMLElement[];
    apply(
      cards.map((card) => ({
        card,
        height: card.getBoundingClientRect().height,
      })),
    );
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [children]);
  return (
    <div
      ref={grid}
      className={`project-grid project-masonry ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
