"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  checkAppVersion,
  isAppUpdateInProgress,
  resumeAppUpdateUi,
} from "@/lib/app-update";
import { showAppUpdateOverlay, hideAppUpdateOverlay } from "@/lib/app-update-overlay";
import { listenForAppUpdates } from "@/lib/service-worker-client";

export function ServiceWorkerUpdater() {
  const [updating, setUpdating] = useState(() => isAppUpdateInProgress());

  useEffect(
    () =>
      listenForAppUpdates(async () => {
        flushSync(() => setUpdating(true));
      }),
    [],
  );

  useEffect(() => {
    if (!updating && !isAppUpdateInProgress()) return;
    showAppUpdateOverlay();
  }, [updating]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      void checkAppVersion().finally(() => {
        if (isAppUpdateInProgress()) {
          resumeAppUpdateUi();
        } else {
          hideAppUpdateOverlay();
        }
      });
    };

    const onFocus = () => {
      void checkAppVersion().finally(() => {
        if (isAppUpdateInProgress()) {
          resumeAppUpdateUi();
        } else {
          hideAppUpdateOverlay();
        }
      });
    };

    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
