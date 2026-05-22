"use client";

import { useEffect } from "react";
import { apiFetch, type Message } from "@/lib/api";
import { mergeConversationMessages } from "@/lib/message-reactions";
import { conversationMessagesPath } from "@/lib/messages";

const POLL_MS_DISCONNECTED = 4000;
const POLL_MS_CONNECTED = 8000;

/** Keep messages and reactions in sync when the socket is down; light backup while connected. */
export function useConversationPollFallback(
  conversationId: string | null,
  connected: boolean,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
): void {
  useEffect(() => {
    if (!conversationId) return;

    const activeConversationId = conversationId;
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiFetch<{ messages: Message[] }>(
          conversationMessagesPath(activeConversationId, { limit: 50 }),
        );
        if (cancelled) return;

        setMessages((prev) => mergeConversationMessages(prev, data.messages));
      } catch {
        // ignore transient poll errors
      }
    }

    void poll();
    const intervalMs = connected ? POLL_MS_CONNECTED : POLL_MS_DISCONNECTED;
    const interval = setInterval(() => void poll(), intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, connected, setMessages]);
}
