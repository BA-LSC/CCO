"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  APP_UPDATE_EVENT,
  checkAppVersion,
  isAppUpdateInProgress,
  isDeployPending,
} from "@/lib/app-update";
import { hideAppUpdateOverlay } from "@/lib/app-update-overlay";
import { listenForAppUpdates } from "@/lib/service-worker-client";

function syncUpdateUi() {
  void checkAppVersion().finally(() => {
    if (!isAppUpdateInProgress() && !isDeployPending()) {
      hideAppUpdateOverlay();
    }
  });
}

export function ServiceWorkerUpdater() {
  const pathname = usePathname();

  useEffect(() => listenForAppUpdates(async () => {}), []);

  useEffect(() => {
    syncUpdateUi();

    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      syncUpdateUi();
    };

    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("pageshow", syncUpdateUi);
    window.addEventListener("focus", syncUpdateUi);
    window.addEventListener(APP_UPDATE_EVENT, syncUpdateUi);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("pageshow", syncUpdateUi);
      window.removeEventListener("focus", syncUpdateUi);
      window.removeEventListener(APP_UPDATE_EVENT, syncUpdateUi);
    };
  }, [pathname]);

  return null;
}
