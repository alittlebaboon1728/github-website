import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, Search, Settings } from "lucide-react";
import type { SearchMode } from "../observatoryApi";
import "./project-search.css";

const modes: { value: SearchMode; label: string }[] = [
  { value: "auto", label: "自动识别" },
  { value: "github", label: "GitHub 搜索" },
  { value: "ai", label: "AI 需求搜索" },
];

export default function ProjectSearch({
  value,
  onChange,
  mode,
  onModeChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  onSubmit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const settings = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!settings.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const choices = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>("button") || [],
    );
    const current = choices.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? choices.length - 1
          : (current + (event.key === "ArrowUp" ? -1 : 1) + choices.length) %
            choices.length;
    choices[next]?.focus();
  }
  return (
    <form
      className="project-search"
      role="search"
      aria-label="项目搜索"
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
        onSubmit(value);
      }}
    >
      <div
        className="project-search-settings"
        ref={settings}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
      >
        <button
          ref={trigger}
          className="project-search-icon project-search-gear bare-control"
          type="button"
          aria-label="搜索设置"
          title={`搜索方式：${modes.find((item) => item.value === mode)?.label}`}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <Settings size={19} strokeWidth={1.6} aria-hidden="true" />
          {mode !== "auto" && (
            <span className="project-search-mode-dot" aria-hidden="true" />
          )}
        </button>
        <div
          ref={menu}
          id={menuId}
          hidden={!open}
          inert={!open}
          aria-hidden={!open}
          role="menu"
          aria-label="搜索模式"
          className="project-search-menu"
          onKeyDown={navigate}
        >
          {modes.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={mode === item.value}
              onClick={() => {
                onModeChange(item.value);
                setOpen(false);
                input.current?.focus();
              }}
            >
              <span>{item.label}</span>
              {mode === item.value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
      <input
        ref={input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        aria-label="搜索 GitHub 公开项目"
        placeholder="搜索项目，或说说你的想法"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={500}
      />
      <button
        className="project-search-icon project-search-submit bare-control"
        type="submit"
        aria-label="搜索项目"
        title="搜索项目"
      >
        <Search size={21} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </form>
  );
}
