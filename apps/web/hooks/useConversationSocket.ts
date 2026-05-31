"use client";

import { useEffect, useRef, useState } from "react";
import { closeWebSocketOnAppUpdate } from "@/lib/app-update-socket";
import { apiFetch, type Message, type Reaction } from "@/lib/api";
import { resolveWebSocketBase } from "@/lib/websocket-url";

type RealtimeEvent =
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message }
  | { type: "message.deleted"; messageId: string }
  | { type: "reaction.changed"; messageId: string; reaction: Reaction; action?: string }
  | {
      type: "conversation.updated";
      conversationId: string;
      leaderOnly?: boolean;
      title?: string;
      imageUrl?: string | null;
    }
  | {
      type: "conversation.read";
      conversationId: string;
      userId: string;
      readAt: string;
    }
  | {
      type: "call.started";
      conversationId: string;
      call: import("@cco/shared/calls").CallSummaryDto;
      timelineEvent: import("@/lib/call-timeline").CallTimelineEventDto;
    }
  | {
      type: "call.updated";
      conversationId: string;
      call: import("@cco/shared/calls").CallSummaryDto;
    }
  | {
      type: "call.ended";
      conversationId: string;
      callId: string;
      timelineEvent: import("@/lib/call-timeline").CallTimelineEventDto | null;
    }
  | {
      type: "typing";
      conversationId: string;
      userId: string;
      displayName: string;
      isTyping: boolean;
    };

export type { RealtimeEvent };

const MAX_RETRY_MS = 30_000;

async function fetchWebSocketBase(): Promise<string> {
  try {
    const res = await fetch("/api/v1/realtime/ws-url", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { wsUrl?: string | null };
      if (data.wsUrl) return data.wsUrl;
    }
  } catch {
    // fall through to client-side derivation
  }

  return resolveWebSocketBase({
    windowProtocol: window.location.protocol,
    windowHost: window.location.host,
  });
}

export function useConversationSocket(
  conversationId: string | null,
  onEvent: (event: RealtimeEvent) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    const wsRef = { current: null as WebSocket | null };
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    const stopAppUpdateSocketReset = closeWebSocketOnAppUpdate(() => wsRef.current);

    function scheduleReconnect() {
      if (cancelled) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(Math.round(retryDelay * 1.5), MAX_RETRY_MS);
        void connect();
      }, retryDelay);
    }

    async function connect() {
      if (cancelled) return;

      let token: string | null = null;
      try {
        const tokenRes = await apiFetch<{ token: string }>("/api/v1/session/ws-token");
        token = tokenRes.token ?? null;
      } catch {
        token = null;
      }

      if (!token) {
        setConnected(false);
        scheduleReconnect();
        return;
      }

      const wsBase = await fetchWebSocketBase();
      const url = `${wsBase}/v1/ws?conversationId=${conversationId}&token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        retryDelay = 1000;
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data as string) as RealtimeEvent;
          onEventRef.current(data);
        } catch {
          // ignore malformed payloads
        }
      };
    }

    void connect();

    return () => {
      cancelled = true;
      stopAppUpdateSocketReset();
      clearTimeout(retryTimer);
      setConnected(false);
      wsRef.current = null;
      ws?.close();
    };
  }, [conversationId]);

  return { connected };
}
