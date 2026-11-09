import { useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { useDropletIndicator } from "./useDropletIndicator";

export function GlassButton({
  variant = "default",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: "default" | "primary" | "bare" }) {
  const bare = variant === "bare";
  return (
    <button
      {...props}
      type={type}
      className={`${bare ? "sg-bare" : "sg-button"} ${className}`.trim()}
      data-variant={variant}
      data-glass-control={bare ? undefined : ""}
      data-glass-bare={bare ? "" : undefined}
    />
  );
}

export function GlassTabs({
  label,
  selection,
  children,
  className = "",
}: {
  label: string;
  selection: string;
  children: ReactNode;
  className?: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const droplet = useRef<HTMLSpanElement>(null);
  useDropletIndicator(group, droplet, selection);
  return (
    <div
      ref={group}
      role="group"
      aria-label={label}
      className={`sg-tabs sg-surface ${className}`}
      data-glass-surface
    >
      <span
        ref={droplet}
        className="sg-droplet"
        data-glass-surface
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
