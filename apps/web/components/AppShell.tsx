"use client";

import { useEffect } from "react";
import { AddToHomeScreenBanner } from "@/components/AddToHomeScreenBanner";
import { PlanningCenterSyncProvider } from "@/components/PlanningCenterSyncContext";
import { ServiceWorkerUpdater } from "@/components/ServiceWorkerUpdater";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  useEffect(() => {
    if (!isStandaloneDisplay()) return;
    document.documentElement.classList.add("standalone-display");
    return () => {
      document.documentElement.classList.remove("standalone-display");
    };
  }, []);

  return (
    <PlanningCenterSyncProvider>
      <ServiceWorkerUpdater />
      <div className="app">
        <AddToHomeScreenBanner />
        <div className="app-body">{children}</div>
      </div>
    </PlanningCenterSyncProvider>
  );
}
