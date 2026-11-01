import type { ComponentProps } from "react";

/** Site controls share material, spacing and states in frosted-glass.css. */
export default function GlassButton({
  variant = "default",
  className = "",
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: "default" | "primary" | "tab" }) {
  return (
    <button
      {...props}
      type={type}
      className={`button glass-control ${variant === "primary" ? "primary-button" : "outline-button"} ${variant === "tab" ? "glass-tab" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
