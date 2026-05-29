"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";

export type ActiveCallEntry = {
  participantCount: number;
  hostDisplayName: string;
};

export function reduceActiveCallsMap(
  map: Map<string, ActiveCallEntry>,
  event: RealtimeEvent,
): Map<string, ActiveCallEntry> {
  if (event.type === "call.started" || event.type === "call.updated") {
    const next = new Map(map);
    if (event.call.participantCount > 0) {
      next.set(event.conversationId, {
        participantCount: event.call.participantCount,
        hostDisplayName: event.call.hostDisplayName,
      });
    } else {
      next.delete(event.conversationId);
    }
    return next;
  }

  if (event.type === "call.ended") {
    const next = new Map(map);
    next.delete(event.conversationId);
    return next;
  }

  return map;
}

export function useActiveCallsMap() {
  const { subscribeRealtime } = useChatLayout();
  const [activeCalls, setActiveCalls] = useState(() => new Map<string, ActiveCallEntry>());

  useEffect(() => {
    return subscribeRealtime((event) => {
      setActiveCalls((prev) => reduceActiveCallsMap(prev, event));
    });
  }, [subscribeRealtime]);

  const getActiveCall = useCallback(
    (conversationId: string) => activeCalls.get(conversationId),
    [activeCalls],
  );

  return { activeCalls, getActiveCall };
}
