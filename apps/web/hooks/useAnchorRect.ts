"use client";

import { useLayoutEffect, useState } from "react";

export function useAnchorRect(anchor: HTMLElement | null, enabled: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !anchor) {
      setRect(null);
      return;
    }

    const update = () => {
      setRect(anchor.getBoundingClientRect());
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, enabled]);

  return rect;
}
