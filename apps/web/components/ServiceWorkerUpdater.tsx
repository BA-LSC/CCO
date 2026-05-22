"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { isAppUpdateInProgress } from "@/lib/app-update";
import { LoadingState } from "@/components/PageStates";
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

  if (!updating && !isAppUpdateInProgress()) return null;

  return (
    <div className="app-update-overlay" role="alert" aria-live="assertive">
      <LoadingState variant="page" label="Updating CCO…" />
    </div>
  );
}
