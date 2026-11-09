import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** Keep this hook in the persistent route shell, not inside each route. */
export function usePersistentMenu(
  header: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLButtonElement | null>,
) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" && matchMedia("(max-width: 820px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 820px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("touchmove", outside, { passive: true });
    document.addEventListener("wheel", outside, { passive: true });
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("touchmove", outside);
      document.removeEventListener("wheel", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, mobile, header, trigger]);
  return { open, setOpen, mobile };
}
