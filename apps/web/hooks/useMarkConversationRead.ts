"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { dispatchUnreadChanged } from "@/lib/sidebar-events";

export function useMarkConversationRead(conversationId: string | null): void {
  useEffect(() => {
    if (!conversationId) return;

    void apiFetch(`/api/v1/conversations/${conversationId}/read`, { method: "POST" }).catch(
      () => {},
    );
    dispatchUnreadChanged({ conversationId, hasUnread: false });
  }, [conversationId]);
}
