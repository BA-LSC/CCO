"use client";

import { useEffect, useRef } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import {
  clampSidebarReveal,
  PWA_HISTORY_GUARD_KEY,
  PWA_SIDEBAR_SWIPE_EDGE_PX,
  resolveSidebarReveal,
} from "@/lib/pwa-sidebar-swipe";

type GestureState = {
  mode: "open" | "close";
  startX: number;
  startY: number;
  startReveal: number;
  sidebarWidth: number;
};

function readSidebarWidth(): number {
  const sidebar = document.querySelector<HTMLElement>(".chat-sidebar");
  return sidebar?.getBoundingClientRect().width ?? 280;
}

function readLeftEdgeZonePx(): number {
  const rootStyles = getComputedStyle(document.documentElement);
  const safeLeft = Number.parseFloat(rootStyles.getPropertyValue("padding-left")) || 0;
  return Math.max(PWA_SIDEBAR_SWIPE_EDGE_PX, safeLeft + 12);
}

export function usePwaSidebarSwipe(enabled: boolean) {
  const { sidebarOpen, openSidebar, closeSidebar, setSidebarRevealPx } = useChatLayout();
  const gestureRef = useRef<GestureState | null>(null);
  const revealRef = useRef(0);
  const sidebarOpenRef = useRef(sidebarOpen);

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    if (!enabled) return;

    history.pushState({ [PWA_HISTORY_GUARD_KEY]: true }, "");

    const onPopState = () => {
      history.pushState({ [PWA_HISTORY_GUARD_KEY]: true }, "");
      if (sidebarOpenRef.current) {
        closeSidebar();
      } else {
        openSidebar();
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, closeSidebar, openSidebar]);

  useEffect(() => {
    if (!enabled) {
      setSidebarRevealPx(null);
      return;
    }

    const finishGesture = () => {
      const gesture = gestureRef.current;
      if (!gesture) return;

      const revealPx = revealRef.current;
      gestureRef.current = null;
      setSidebarRevealPx(null);

      if (resolveSidebarReveal(revealPx, gesture.sidebarWidth) === "open") {
        openSidebar();
      } else {
        closeSidebar();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (event.target instanceof Element && event.target.closest(".attachment-lightbox")) return;

      const touch = event.touches[0];
      const sidebarWidth = readSidebarWidth();
      const leftEdgeZone = readLeftEdgeZonePx();
      const open = sidebarOpenRef.current;

      if (!open && touch.clientX <= leftEdgeZone) {
        gestureRef.current = {
          mode: "open",
          startX: touch.clientX,
          startY: touch.clientY,
          startReveal: 0,
          sidebarWidth,
        };
        revealRef.current = 0;
        return;
      }

      if (!open) return;

      const onSidebar =
        event.target instanceof Element && Boolean(event.target.closest(".chat-sidebar"));
      const onOverlay =
        event.target instanceof Element && Boolean(event.target.closest(".chat-sidebar-overlay"));
      const inCloseZone = touch.clientX <= sidebarWidth + 16;

      if (onSidebar || onOverlay || inCloseZone) {
        gestureRef.current = {
          mode: "close",
          startX: touch.clientX,
          startY: touch.clientY,
          startReveal: sidebarWidth,
          sidebarWidth,
        };
        revealRef.current = sidebarWidth;
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (gesture.mode === "open" && gesture.startReveal === 0) {
        if (Math.abs(deltaX) <= 6 && Math.abs(deltaY) <= 6) return;
        if (Math.abs(deltaX) <= Math.abs(deltaY)) {
          gestureRef.current = null;
          return;
        }
      }

      event.preventDefault();
      const revealPx = clampSidebarReveal(gesture.startReveal + deltaX, gesture.sidebarWidth);
      revealRef.current = revealPx;
      setSidebarRevealPx(revealPx);
    };

    const onTouchEnd = () => {
      finishGesture();
    };

    const onTouchCancel = () => {
      finishGesture();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      gestureRef.current = null;
      setSidebarRevealPx(null);
    };
  }, [enabled, closeSidebar, openSidebar, setSidebarRevealPx]);
}
