"use client";

import { useMemo } from "react";
import { useOptionalActiveCall } from "@/components/calls/ConversationCallContext";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";
import { resolveSidebarActiveCall } from "@/lib/sidebar-active-call";

export { resolveSidebarActiveCall } from "@/lib/sidebar-active-call";

/** Sidebar rows: shared active-calls map plus in-call session for the home conversation. */
export function useSidebarActiveCall(conversationId: string | null | undefined) {
  const { getActiveCall } = useActiveCallsMap();
  const callCtx = useOptionalActiveCall();
  const sessionCall = callCtx?.activeCall;

  return useMemo(() => {
    if (!conversationId) return undefined;
    return resolveSidebarActiveCall(conversationId, getActiveCall(conversationId), sessionCall);
  }, [conversationId, getActiveCall, sessionCall]);
}
