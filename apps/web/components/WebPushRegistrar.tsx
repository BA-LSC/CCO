"use client";

import { useEffect } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { ensureWebPushSubscription } from "@/lib/web-push";

export function WebPushRegistrar() {
  const { session, sessionLoading } = useChatLayout();

  useEffect(() => {
    if (sessionLoading || !session?.userId) return;
    void ensureWebPushSubscription({ promptIfNeeded: false });

    function syncOnVisible() {
      if (document.visibilityState !== "visible") return;
      if (Notification.permission !== "granted") return;
      void ensureWebPushSubscription({ promptIfNeeded: false });
    }

    document.addEventListener("visibilitychange", syncOnVisible);
    return () => document.removeEventListener("visibilitychange", syncOnVisible);
  }, [session?.userId, sessionLoading]);

  return null;
}
