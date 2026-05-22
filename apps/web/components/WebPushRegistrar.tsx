"use client";

import { useEffect } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { ensureWebPushSubscription } from "@/lib/web-push";

export function WebPushRegistrar() {
  const { session, sessionLoading } = useChatLayout();

  useEffect(() => {
    if (sessionLoading || !session?.userId) return;
    void ensureWebPushSubscription({ promptIfNeeded: false });
  }, [session?.userId, sessionLoading]);

  return null;
}
