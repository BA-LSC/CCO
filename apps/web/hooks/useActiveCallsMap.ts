"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CallSummaryDto } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { fetchActiveCall } from "@/lib/calls-api";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";

export function reduceActiveCallsMap(
  map: Map<string, CallSummaryDto>,
  event: RealtimeEvent,
): Map<string, CallSummaryDto> {
  if (event.type === "call.started" || event.type === "call.updated") {
    const next = new Map(map);
    if (event.call.participantCount > 0) {
      next.set(event.conversationId, event.call);
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

export function applyActiveCallToMap(
  map: Map<string, CallSummaryDto>,
  call: CallSummaryDto | null,
  conversationId: string,
): Map<string, CallSummaryDto> {
  if (call && call.participantCount > 0) {
    const next = new Map(map);
    next.set(conversationId, call);
    return next;
  }
  if (!map.has(conversationId)) return map;
  const next = new Map(map);
  next.delete(conversationId);
  return next;
}

type ActiveCallsMapContextValue = {
  getActiveCall: (conversationId: string) => CallSummaryDto | undefined;
  registerActiveCall: (
    call: CallSummaryDto | null,
    options?: { conversationId?: string },
  ) => void;
  hydrateActiveCalls: (conversationIds: string[]) => Promise<void>;
};

const ActiveCallsMapContext = createContext<ActiveCallsMapContextValue | null>(null);

export function ActiveCallsMapProvider({ children }: { children: ReactNode }) {
  const { subscribeRealtime } = useChatLayout();
  const [activeCalls, setActiveCalls] = useState(() => new Map<string, CallSummaryDto>());

  useEffect(() => {
    return subscribeRealtime((event) => {
      setActiveCalls((prev) => reduceActiveCallsMap(prev, event));
    });
  }, [subscribeRealtime]);

  const registerActiveCall = useCallback(
    (call: CallSummaryDto | null, options?: { conversationId?: string }) => {
      const conversationId = call?.conversationId ?? options?.conversationId;
      if (!conversationId) return;
      setActiveCalls((prev) => applyActiveCallToMap(prev, call, conversationId));
    },
    [],
  );

  const hydrateActiveCalls = useCallback(async (conversationIds: string[]) => {
    const unique = [...new Set(conversationIds.filter(Boolean))];
    if (unique.length === 0) return;

    const results = await Promise.all(
      unique.map(async (conversationId) => {
        try {
          const { call } = await fetchActiveCall(conversationId);
          return { conversationId, call: call ?? null };
        } catch {
          return { conversationId, call: null };
        }
      }),
    );

    setActiveCalls((prev) => {
      let next = prev;
      for (const { conversationId, call } of results) {
        next = applyActiveCallToMap(next, call, conversationId);
      }
      return next;
    });
  }, []);

  const getActiveCall = useCallback(
    (conversationId: string) => activeCalls.get(conversationId),
    [activeCalls],
  );

  const value = useMemo(
    () => ({ getActiveCall, registerActiveCall, hydrateActiveCalls }),
    [getActiveCall, hydrateActiveCalls, registerActiveCall],
  );

  return createElement(ActiveCallsMapContext.Provider, { value }, children);
}

function useActiveCallsMapContext(): ActiveCallsMapContextValue {
  const value = useContext(ActiveCallsMapContext);
  if (!value) {
    throw new Error("useActiveCallsMap must be used within ActiveCallsMapProvider");
  }
  return value;
}

export function useActiveCallsMap() {
  return useActiveCallsMapContext();
}
