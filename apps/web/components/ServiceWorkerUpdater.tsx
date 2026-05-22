"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { LoadingState } from "@/components/PageStates";
import { listenForAppUpdates, waitForOverlayPaint } from "@/lib/service-worker-client";

export function ServiceWorkerUpdater() {
  const [updating, setUpdating] = useState(false);

  useEffect(
    () =>
      listenForAppUpdates(async () => {
        flushSync(() => setUpdating(true));
        await waitForOverlayPaint();
      }),
    [],
  );

  if (!updating) return null;

  return (
    <div className="app-update-overlay" role="alert" aria-live="assertive">
      <LoadingState variant="page" label="Updating CCO…" />
    </div>
  );
}
