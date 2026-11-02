import { useRef } from "react";
import { categories } from "../catalog";
import { useDropletIndicator } from "../useDropletIndicator";

export default function CategoryFilters({
  active,
  onChange,
  onIntent,
}: {
  active: string | null;
  onChange: (id: string) => void;
  onIntent?: (id: string) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const droplet = useRef<HTMLSpanElement>(null);
  useDropletIndicator(group, droplet, active);
  return (
    <div
      ref={group}
      className="quick-topics category-filters"
      role="group"
      aria-label="按用途浏览"
    >
      <span ref={droplet} className="selection-droplet" aria-hidden="true" />
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className="bare-control"
          aria-pressed={active === category.id}
          onClick={() => onChange(category.id)}
          onPointerEnter={() => onIntent?.(category.id)}
          onFocus={() => onIntent?.(category.id)}
          onTouchStart={() => onIntent?.(category.id)}
        >
          {category.id === "all" ? "全部" : category.name}
        </button>
      ))}
    </div>
  );
}
