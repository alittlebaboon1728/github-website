import { useRef } from "react";
import type { ReactNode } from "react";
import { useDropletIndicator } from "../useDropletIndicator";

/** Shared glass rail with one moving selection surface. */
export default function GlassTabs({
  as: Element = "div",
  label,
  selection,
  className = "",
  children,
}: {
  as?: "div" | "nav";
  label: string;
  selection: string;
  className?: string;
  children: ReactNode;
}) {
  const group = useRef<HTMLDivElement>(null);
  const droplet = useRef<HTMLSpanElement>(null);
  useDropletIndicator(group, droplet, selection);
  return (
    <Element
      ref={group}
      className={`glass-tabs droplet-tabs ${className}`}
      role={Element === "nav" ? undefined : "group"}
      aria-label={label}
    >
      <span ref={droplet} className="selection-droplet" aria-hidden="true" />
      {children}
    </Element>
  );
}
