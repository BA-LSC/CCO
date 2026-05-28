"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Matches attachment lightbox exit animation duration in globals.css */
export const ATTACHMENT_LIGHTBOX_EXIT_MS = 280;

export function useAnimatedDismiss(
  onClose: () => void,
  durationMs = ATTACHMENT_LIGHTBOX_EXIT_MS,
) {
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);

  const requestClose = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => {
      onClose();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, exiting, onClose]);

  return { exiting, requestClose };
}
