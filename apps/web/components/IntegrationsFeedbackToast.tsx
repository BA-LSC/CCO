"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";

type Props = {
  error?: string | null;
  success?: string | null;
  onDismiss?: () => void;
};

/** Transient admin/integration feedback — bottom-right toast with 7s auto-dismiss. */
export function IntegrationsFeedbackToast({ error, success, onDismiss }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const message = error ?? success;
  if (!message || !mounted) return null;

  const variant = error ? "error" : "success";

  return createPortal(
    <ChatHomeBanner
      variant={variant}
      autoDismissMs={CHAT_PANEL_BANNER_AUTO_DISMISS_MS}
      onDismiss={onDismiss}
      placement="fixed"
    >
      {message}
    </ChatHomeBanner>,
    document.body,
  );
}
