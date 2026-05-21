"use client";

import { useEffect, useState, type ReactNode } from "react";

const EXIT_MS = 320;

type Props = {
  variant: "success" | "error";
  children: ReactNode;
  /** Auto-dismiss after this many ms; omit to keep visible */
  autoDismissMs?: number;
};

export function ChatHomeBanner({ variant, children, autoDismissMs }: Props) {
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

  return (
    <div className="chat-home-banner-wrap">
      <div
        className={[
          "chat-home-banner",
          variant,
          exiting ? "chat-home-banner--exit" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role={variant === "error" ? "alert" : "status"}
      >
        {children}
      </div>
    </div>
  );
}
