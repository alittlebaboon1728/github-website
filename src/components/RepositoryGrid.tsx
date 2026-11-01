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
    const measure = (card: HTMLElement) => {
      const span = Math.ceil(card.getBoundingClientRect().height) + 24;
      if (card.style.getPropertyValue("--card-span") !== String(span))
        card.style.setProperty("--card-span", String(span));
    };
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.target as HTMLElement);
    });
    for (const card of Array.from(element.children)) {
      measure(card as HTMLElement);
      observer.observe(card);
    }
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
