"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { apiFetch } from "@/lib/api";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import { getReadyServiceWorkerRegistration } from "@/lib/service-worker-client";
import {
  ensureWebPushSubscription,
  isStandalonePwa,
  pushSupported,
  subscribeToWebPush,
} from "@/lib/web-push";

const DISMISS_KEY = "cco-notifications-banner-dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
}

export function EnableNotificationsBanner() {
  const { session, sessionLoading } = useChatLayout();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [webPushConfigured, setWebPushConfigured] = useState(false);

  useEffect(() => {
    if (sessionLoading || !session?.userId) {
      setWebPushConfigured(false);
      return;
    }

    let cancelled = false;
    void apiFetch<{ publicKey: string }>("/api/v1/push/vapid-public-key")
      .then(() => {
        if (!cancelled) setWebPushConfigured(true);
      })
      .catch(() => {
        if (!cancelled) setWebPushConfigured(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.userId, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || !session?.userId) {
      setVisible(false);
      return;
    }
    if (!webPushConfigured) {
      setVisible(false);
      return;
    }
    if (!isStandaloneDisplay() && !isStandalonePwa()) {
      setVisible(false);
      return;
    }
    if (!pushSupported()) {
      setVisible(false);
      return;
    }
    if (isDismissed()) {
      setVisible(false);
      return;
    }

    const permission = Notification.permission;
    setBlocked(permission === "denied");
    setVisible(permission !== "granted");
  }, [session?.userId, sessionLoading, webPushConfigured]);

  useEffect(() => {
    if (!visible) return;
    void getReadyServiceWorkerRegistration();
  }, [visible]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      await subscribeToWebPush();
    } catch (err) {
      console.warn("Web push subscribe failed:", err);
    } finally {
      setBusy(false);

      const permission = Notification.permission;
      if (permission === "granted") {
        await ensureWebPushSubscription().catch((err) => {
          console.warn("Web push ensure failed:", err);
        });
        dismissBanner();
        setVisible(false);
        return;
      }

      if (permission === "denied") {
        setBlocked(true);
      }
    }
  }, []);

  const dismiss = useCallback(() => {
    dismissBanner();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="notifications-banner" role="region" aria-label="Enable notifications">
      <div className="notifications-banner-copy">
        <strong>Turn on notifications</strong>
        <p>
          {blocked
            ? "Notifications are blocked. Open Settings → CCO → Notifications to allow alerts."
            : "Get notified when you receive new messages."}
        </p>
      </div>
      <div className="notifications-banner-actions">
        {!blocked ? (
          <button
            type="button"
            className="a2hs-banner-btn a2hs-banner-btn-primary"
            disabled={busy}
            onClick={() => void enable()}
          >
            {busy ? "Enabling…" : "Enable"}
          </button>
        ) : null}
        <button type="button" className="a2hs-banner-btn" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
