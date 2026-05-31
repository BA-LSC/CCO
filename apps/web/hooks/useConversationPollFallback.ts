"use client";

import { useEffect, useRef } from "react";
import { apiFetch, type MemberReadReceipt, type Message, type MessageListResponse } from "@/lib/api";
import type { CallTimelineEventDto } from "@/lib/call-timeline";
import { mergeCallTimelineEvents, normalizeCallTimelineEvents } from "@/lib/call-timeline";
import { mergeConversationMessages, type MergeConversationMessagesOptions } from "@/lib/message-reactions";
import { conversationMessagesPath } from "@/lib/messages";

const POLL_MS_DISCONNECTED = 4000;
const POLL_MS_CONNECTED = 8000;

export type ConversationPollMergeOptions = {
  getMergeOptions?: () => MergeConversationMessagesOptions;
  onPollData?: (data: Pick<MessageListResponse, "peerLastReadAt" | "memberReadReceipts">) => void;
};

/** Keep messages and reactions in sync when the socket is down; light backup while connected. */
export function useConversationPollFallback(
  conversationId: string | null,
  connected: boolean,
  messagesLoading: boolean,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  pollMerge?: ConversationPollMergeOptions,
  setCallEvents?: React.Dispatch<React.SetStateAction<CallTimelineEventDto[]>>,
): void {
  const pollMergeRef = useRef(pollMerge);
  pollMergeRef.current = pollMerge;

  useEffect(() => {
    if (!conversationId || messagesLoading) return;

    const activeConversationId = conversationId;
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiFetch<MessageListResponse>(
          conversationMessagesPath(activeConversationId, { limit: 50 }),
        );
        if (cancelled) return;

        pollMergeRef.current?.onPollData?.(data);

        const mergeOptions = pollMergeRef.current?.getMergeOptions?.();
        setMessages((prev) => mergeConversationMessages(prev, data.messages, mergeOptions));
        if (setCallEvents && data.callEvents) {
          setCallEvents((prev) =>
            normalizeCallTimelineEvents(mergeCallTimelineEvents(prev, data.callEvents ?? [])),
          );
        }
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
  }, [conversationId, connected, messagesLoading, setMessages, setCallEvents]);
}
