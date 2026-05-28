"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { resolveWebSocketBase } from "@/lib/websocket-url";

const MAX_RETRY_MS = 30_000;
const WS_TOKEN_REFRESH_MS = 10 * 60 * 1000;

async function fetchWebSocketBase(): Promise<string> {
  try {
    const res = await fetch("/api/v1/realtime/ws-url", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { wsUrl?: string | null };
      if (data.wsUrl) return data.wsUrl;
    }
  } catch {
    // fall through
  }
  return resolveWebSocketBase({
    windowProtocol: window.location.protocol,
    windowHost: window.location.host,
  });
}

/** User-scoped socket for sidebar previews and cross-conversation events. */
export function useUserInboxSocket(
  userId: string | null,
  onEvent: (event: RealtimeEvent) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

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
      const url = `${wsBase}/v1/ws/inbox?token=${encodeURIComponent(token)}`;
      ws?.close();
      ws = new WebSocket(url);

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
    const tokenRefreshTimer = setInterval(() => {
      void connect();
    }, WS_TOKEN_REFRESH_MS);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(tokenRefreshTimer);
      setConnected(false);
      ws?.close();
    };
  }, [userId]);

  return { connected };
}
