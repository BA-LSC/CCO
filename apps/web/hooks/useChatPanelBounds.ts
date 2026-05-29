"use client";

import { useLayoutEffect, useState } from "react";

const PIP_COMPOSER_CLEARANCE_PX = 8;

function findChatPanelElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector<HTMLElement>(".chat-panel-content") ??
    document.querySelector<HTMLElement>(".chat-main")
  );
}

/** Keep bottom-corner PiP above the pinned message composer. */
export function chatPanelPipBounds(panel: DOMRect, root: HTMLElement): DOMRect {
  const composer = root.querySelector<HTMLElement>(".chat-composer-stack");
  if (!composer) return panel;

  const composerTop = composer.getBoundingClientRect().top;
  const maxBottom = composerTop - PIP_COMPOSER_CLEARANCE_PX;
  if (maxBottom <= panel.top) return panel;

  return new DOMRect(panel.left, panel.top, panel.width, maxBottom - panel.top);
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
      const panelRect = element.getBoundingClientRect();
      setBounds(chatPanelPipBounds(panelRect, element));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const composer = element.querySelector<HTMLElement>(".chat-composer-stack");
    if (composer) observer.observe(composer);

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
