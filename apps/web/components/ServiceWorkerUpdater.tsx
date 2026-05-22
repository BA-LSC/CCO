"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { isAppUpdateInProgress } from "@/lib/app-update";
import { showAppUpdateOverlay } from "@/lib/app-update-overlay";
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

  return null;
}
