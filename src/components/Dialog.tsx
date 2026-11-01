import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export default function Dialog({
  title,
  children,
  onClose,
  className = "",
  focusInput = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  focusInput?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const handler = useRef(onClose);
  handler.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (
      (focusInput && element.current?.querySelector<HTMLElement>("input")) ||
      element.current
    )?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") handler.current();
      if (event.key !== "Tab") return;
      const items = Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        ) || [],
      ).filter((item) => item.getClientRects().length > 0);
      if (!items.length) return;
      if (
        event.shiftKey &&
        (document.activeElement === items[0] ||
          document.activeElement === element.current)
      ) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === items[items.length - 1] ||
          document.activeElement === element.current)
      ) {
        event.preventDefault();
        items[0].focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-shade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={element}
        className={`dialog ${className}`}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
      >
        <button
          className="icon-btn dialog-close"
          aria-label="关闭弹窗"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        {children}
      </div>
    </div>
  );
}
