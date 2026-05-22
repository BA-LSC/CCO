"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "@/components/PageStates";
import { listenForServiceWorkerUpdates } from "@/lib/service-worker-client";

export function ServiceWorkerUpdater() {
  const [updating, setUpdating] = useState(false);

  useEffect(() => listenForServiceWorkerUpdates(() => setUpdating(true)), []);

  if (!updating) return null;

  return (
    <div className="app-update-overlay" role="alert" aria-live="assertive">
      <LoadingState variant="page" label="Updating CCO…" />
    </div>
  );
}
