"use client";

import { useLayoutEffect, useState } from "react";

function findChatPanelElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector<HTMLElement>(".chat-panel-content") ??
    document.querySelector<HTMLElement>(".chat-main")
  );
}

export function useChatPanelBounds(enabled: boolean): DOMRect | null {
  const [bounds, setBounds] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setBounds(null);
      return;
    }

    const element = findChatPanelElement();
    if (!element) {
      setBounds(null);
      return;
    }

    const update = () => {
      setBounds(element.getBoundingClientRect());
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [enabled]);

  return bounds;
}

export function viewportBounds(): DOMRect {
  if (typeof window === "undefined") {
    return new DOMRect(0, 0, 360, 640);
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}
