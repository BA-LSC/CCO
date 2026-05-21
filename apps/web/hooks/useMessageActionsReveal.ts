"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LONG_PRESS_MS = 450;

export function useMessageActionsReveal() {
  const [revealedMessageId, setRevealedMessageId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMessageRef = useRef<string | null>(null);
  const justRevealedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reveal = useCallback((messageId: string) => {
    setRevealedMessageId(messageId);
    justRevealedRef.current = true;
    window.setTimeout(() => {
      justRevealedRef.current = false;
    }, 400);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  }, []);

  const dismiss = useCallback(() => {
    setRevealedMessageId(null);
  }, []);

  const getBubbleHandlers = useCallback(
    (messageId: string) => ({
      onTouchStart: () => {
        touchMessageRef.current = messageId;
        clearTimer();
        timerRef.current = setTimeout(() => reveal(messageId), LONG_PRESS_MS);
      },
      onTouchEnd: () => {
        clearTimer();
        touchMessageRef.current = null;
      },
      onTouchMove: () => {
        clearTimer();
        touchMessageRef.current = null;
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        reveal(messageId);
      },
    }),
    [clearTimer, reveal],
  );

  useEffect(() => {
    if (!revealedMessageId) return;

    const onPointerDown = (event: PointerEvent) => {
      if (justRevealedRef.current) return;
      const target = event.target as Element | null;
      if (target?.closest(".message-bubble--actions-visible")) return;
      if (target?.closest(".message-emoji-picker")) return;
      if (target?.closest(".message-action-picker")) return;
      dismiss();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [revealedMessageId, dismiss]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    revealedMessageId,
    dismiss,
    getBubbleHandlers,
    isRevealed: (messageId: string) => revealedMessageId === messageId,
  };
}
