"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import {
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

  useEffect(() => {
    if (sessionLoading || !session?.userId) {
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
  }, [session?.userId, sessionLoading]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const subscribed = await subscribeToWebPush();
      if (subscribed || Notification.permission === "granted") {
        setVisible(false);
        return;
      }
      if (Notification.permission === "denied") {
        setBlocked(true);
      }
    } finally {
      setBusy(false);
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
