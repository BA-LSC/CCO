"use client";

import { useEffect } from "react";
import { listenForAppUpdates } from "@/lib/service-worker-client";

export function ServiceWorkerUpdater() {
  useEffect(() => listenForAppUpdates(async () => {}), []);
  return null;
}
