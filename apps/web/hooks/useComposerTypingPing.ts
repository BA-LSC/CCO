"use client";

import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

const TYPING_PING_INTERVAL_MS = 2_000;
const TYPING_IDLE_MS = 3_000;

export function useComposerTypingPing(
  conversationId: string | null,
  enabled: boolean,
  body: string,
): void {
  const isTypingRef = useRef(false);
  const lastPingAtRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId || !enabled) return;
      if (isTypingRef.current === isTyping && !isTyping) return;

      try {
        await apiFetch(`/api/v1/conversations/${conversationId}/typing`, {
          method: "POST",
          body: JSON.stringify({ isTyping }),
        });
        isTypingRef.current = isTyping;
      } catch {
        // ignore transient network failures
      }
    },
    [conversationId, enabled],
  );

  useEffect(() => {
    if (!conversationId || !enabled) {
      void sendTyping(false);
      return;
    }

    if (body.length === 0) {
      clearTimeout(idleTimerRef.current);
      void sendTyping(false);
      return;
    }

    const now = Date.now();
    if (!isTypingRef.current || now - lastPingAtRef.current >= TYPING_PING_INTERVAL_MS) {
      lastPingAtRef.current = now;
      void sendTyping(true);
    }

    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      void sendTyping(false);
    }, TYPING_IDLE_MS);

    return () => {
      clearTimeout(idleTimerRef.current);
    };
  }, [body, conversationId, enabled, sendTyping]);

  useEffect(() => {
    return () => {
      clearTimeout(idleTimerRef.current);
      if (conversationId && isTypingRef.current) {
        void apiFetch(`/api/v1/conversations/${conversationId}/typing`, {
          method: "POST",
          body: JSON.stringify({ isTyping: false }),
        }).catch(() => {});
        isTypingRef.current = false;
      }
    };
  }, [conversationId]);
}
