"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const EXIT_MS = 320;

export const CHAT_PANEL_BANNER_AUTO_DISMISS_MS = 7000;

export type ChatHomeBannerVariant = "success" | "error" | "neutral";
export type ChatHomeBannerPlacement = "default" | "fixed" | "panel";

type Props = {
  variant: ChatHomeBannerVariant;
  children: ReactNode;
  /** Auto-dismiss after this many ms; omit to keep visible */
  autoDismissMs?: number;
  /** Called after the exit animation completes */
  onDismiss?: () => void;
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
  onDismiss,
  actions,
  placement = "default",
}: Props) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const bannerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  const dismissEnabled =
    autoDismissMs != null && autoDismissMs > 0 && actions == null;

  const beginExit = useCallback(() => {
    setExiting(true);
  }, []);

  useEffect(() => {
    if (!dismissEnabled || autoDismissMs == null) return;

    let remaining = autoDismissMs;
    let lastFrame = performance.now();
    let frame = 0;

    const onPointerEnter = () => {
      pausedRef.current = true;
    };

    const onPointerLeave = () => {
      pausedRef.current = false;
      lastFrame = performance.now();
    };

    const el = bannerRef.current;
    el?.addEventListener("pointerenter", onPointerEnter);
    el?.addEventListener("pointerleave", onPointerLeave);

    const tick = (now: number) => {
      if (!pausedRef.current) {
        const delta = now - lastFrame;
        lastFrame = now;
        remaining = Math.max(0, remaining - delta);
        setProgress((remaining / autoDismissMs) * 100);
        if (remaining <= 0) {
          beginExit();
          return;
        }
      } else {
        lastFrame = now;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      el?.removeEventListener("pointerenter", onPointerEnter);
      el?.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [autoDismissMs, beginExit, dismissEnabled]);

  useEffect(() => {
    if (!exiting) return;

    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [exiting, onDismiss]);

  if (!visible) return null;

  const role = variant === "error" || actions ? "alert" : "status";

  return (
    <div className={wrapClassName(placement)}>
      <div
        ref={bannerRef}
        className={[
          "chat-home-banner",
          variant,
          actions ? "chat-home-banner--with-actions" : "",
          exiting ? "chat-home-banner--exit" : "",
          dismissEnabled ? "chat-home-banner--auto-dismiss" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role={role}
      >
        <div className="chat-home-banner-body">{children}</div>
        {actions ? <div className="chat-home-banner-actions">{actions}</div> : null}
        {dismissEnabled ? (
          <div className="chat-home-banner-progress" aria-hidden>
            <div
              className="chat-home-banner-progress-bar"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
