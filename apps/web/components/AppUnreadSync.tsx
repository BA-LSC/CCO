"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import { syncAppBadge, appBadgeSupported } from "@/lib/app-badge";
import { apiFetch } from "@/lib/api";
import { isPushClientMessage } from "@/lib/push-client-events";
import { dispatchUnreadChanged, subscribeUnreadChanged } from "@/lib/sidebar-events";

const STANDALONE_POLL_MS = 30_000;

export function AppUnreadSync() {
  const pathname = usePathname();
  const { session, sessionLoading } = useChatLayout();

  const refreshUnreadBadge = useCallback(async () => {
    if (!session?.userId) return;

    try {
      const { count } = await apiFetch<{ count: number }>("/api/v1/unread/summary");
      await syncAppBadge(count);
      window.dispatchEvent(new CustomEvent("cco:sidebar-reload"));
    } catch {
      // Ignore transient API errors during deploy.
    }
  }, [session?.userId]);

  useEffect(() => {
    if (sessionLoading || !session?.userId) return;
    void refreshUnreadBadge();
  }, [pathname, refreshUnreadBadge, session?.userId, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || !session?.userId) return;

    return subscribeUnreadChanged(() => {
      void refreshUnreadBadge();
    });
  }, [refreshUnreadBadge, session?.userId, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || !session?.userId) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshUnreadBadge();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [refreshUnreadBadge, session?.userId, sessionLoading]);

  useEffect(() => {
    if (!isStandaloneDisplay() || sessionLoading || !session?.userId) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshUnreadBadge();
    }, STANDALONE_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshUnreadBadge, session?.userId, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || !session?.userId) return;

    const onControllerMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isPushClientMessage(event.data)) return;
      void refreshUnreadBadge();
      if (event.data.conversationId) {
        dispatchUnreadChanged({
          conversationId: event.data.conversationId,
          hasUnread: true,
        });
      }
    };

    const onSwMessage = (event: Event) => {
      const messageEvent = event as MessageEvent;
      onControllerMessage(messageEvent);
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  }, [refreshUnreadBadge, session?.userId, sessionLoading]);

  useEffect(() => {
    if (!appBadgeSupported() || sessionLoading || !session?.userId) return;

    const onPageShow = () => void refreshUnreadBadge();
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refreshUnreadBadge, session?.userId, sessionLoading]);

  return null;
}
