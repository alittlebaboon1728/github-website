import { useRef } from "react";
import { useDropletIndicator } from "../useDropletIndicator";

type Section = "discover" | "trends" | "stories" | "saved";
const sections: { id: Section; label: string }[] = [
  { id: "discover", label: "发现项目" },
  { id: "trends", label: "趋势与榜单" },
  { id: "stories", label: "项目试用" },
  { id: "saved", label: "我的收藏" },
];

export default function SiteNavigation({
  active,
  open,
  savedCount,
  onIntent,
}: {
  active: Section;
  open: boolean;
  savedCount: number;
  onIntent?: (section: Section) => void;
}) {
  const nav = useRef<HTMLElement>(null);
  const droplet = useRef<HTMLSpanElement>(null);
  useDropletIndicator(nav, droplet, `${active}:${open}`);

  return (
    <nav
      ref={nav}
      className={`site-navigation ${open ? "mobile-open" : ""}`}
      aria-label="主导航"
      id="project-navigation"
    >
      <span ref={droplet} className="navigation-droplet" aria-hidden="true" />
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#/${section.id}`}
          className={active === section.id ? "selected" : ""}
          aria-current={active === section.id ? "page" : undefined}
          onPointerEnter={() => onIntent?.(section.id)}
          onFocus={() => onIntent?.(section.id)}
          onTouchStart={() => onIntent?.(section.id)}
        >
          {section.label}
          {section.id === "saved" && savedCount > 0 && (
            <span
              className="navigation-count"
              aria-label={`${savedCount} 个收藏`}
            >
              {savedCount > 99 ? "99+" : savedCount}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}
