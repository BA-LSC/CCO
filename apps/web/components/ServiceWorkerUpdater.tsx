"use client";

import { useEffect } from "react";
import { listenForDeployEvents } from "@/lib/deploy-events-client";
import { listenForAppUpdates } from "@/lib/service-worker-client";

export function ServiceWorkerUpdater() {
  useEffect(() => {
    const stopDeployEvents = listenForDeployEvents();
    const stopAppUpdates = listenForAppUpdates(async () => {});
    return () => {
      stopDeployEvents();
      stopAppUpdates();
    };
  }, []);
  return null;
}
