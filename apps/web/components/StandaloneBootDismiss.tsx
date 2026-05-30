"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { hideAppBootOverlay } from "@/lib/app-update-overlay";
import { isChatIndexPath } from "@/lib/last-chat-path";

/** Removes the imperative PWA boot overlay once chat routing leaves the index route. */
export function StandaloneBootDismiss() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isChatIndexPath(pathname)) {
      hideAppBootOverlay();
    }
  }, [pathname]);

  return null;
}
