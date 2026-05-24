"use client";

import { useEffect, useState, type ReactNode } from "react";

const EXIT_MS = 320;

export type ChatHomeBannerVariant = "success" | "error" | "neutral";
export type ChatHomeBannerPlacement = "default" | "fixed" | "panel";

type Props = {
  variant: ChatHomeBannerVariant;
  children: ReactNode;
  /** Auto-dismiss after this many ms; omit to keep visible */
  autoDismissMs?: number;
  actions?: ReactNode;
  placement?: ChatHomeBannerPlacement;
};

function wrapClassName(placement: ChatHomeBannerPlacement): string {
  switch (placement) {
    case "fixed":
      return "chat-home-banner-wrap chat-home-banner-wrap--fixed";
    case "panel":
      return "chat-home-banner-wrap chat-home-banner-wrap--panel";
    case "default":
      return "chat-home-banner-wrap";
  }
}

export function ChatHomeBanner({
  variant,
  children,
  autoDismissMs,
  actions,
  placement = "default",
}: Props) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (autoDismissMs == null || autoDismissMs <= 0) return;
    const timer = window.setTimeout(() => setExiting(true), autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs]);

  useEffect(() => {
    if (!exiting) return;

    const timer = window.setTimeout(() => setVisible(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  if (!visible) return null;

  const role = variant === "error" || actions ? "alert" : "status";

  return (
    <div className={wrapClassName(placement)}>
      <div
        className={[
          "chat-home-banner",
          variant,
          actions ? "chat-home-banner--with-actions" : "",
          exiting ? "chat-home-banner--exit" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role={role}
      >
        <div className="chat-home-banner-body">{children}</div>
        {actions ? <div className="chat-home-banner-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
