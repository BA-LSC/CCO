"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, Reaction } from "@/lib/api";
import { resolveWebSocketBase } from "@/lib/websocket-url";

type RealtimeEvent =
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message }
  | { type: "message.deleted"; messageId: string }
  | { type: "reaction.changed"; messageId: string; reaction: Reaction; action?: string };

export function useConversationSocket(
  conversationId: string | null,
  token: string | null,
  onEvent: (event: RealtimeEvent) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!conversationId || !token) return;

    const wsBase = resolveWebSocketBase({
      windowProtocol: window.location.protocol,
      windowHost: window.location.host,
    });
    const url = `${wsBase}/v1/ws?conversationId=${conversationId}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as RealtimeEvent;
        onEventRef.current(data);
      } catch {
        // ignore malformed
      }
    };

    return () => ws.close();
  }, [conversationId, token]);

  return { connected };
}
