import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, SlidersHorizontal } from "lucide-react";

export default function FilterDisclosure({
  label,
  children,
  iconOnly = false,
  initiallyOpen = true,
}: {
  label: string;
  children: ReactNode;
  iconOnly?: boolean;
  initiallyOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(
    () => initiallyOpen || window.matchMedia("(min-width: 761px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");
    const change = () => {
      if (media.matches) setExpanded(true);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return (
    <details
      className={`filter-disclosure${iconOnly ? " filter-disclosure--icon" : ""}`}
      open={expanded}
    >
      <summary
        aria-label={label}
        title={iconOnly ? label : undefined}
        onClick={(event) => {
          event.preventDefault();
          setExpanded(
            (value) =>
              window.matchMedia("(min-width: 761px)").matches || !value,
          );
        }}
      >
        {iconOnly ? (
          <SlidersHorizontal size={17} aria-hidden="true" />
        ) : (
          <>
            <ChevronRight
              className="disclosure-chevron"
              size={16}
              aria-hidden="true"
            />
            <span>{label}</span>
          </>
        )}
      </summary>
      {children}
    </details>
  );
}
