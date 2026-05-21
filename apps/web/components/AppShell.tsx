"use client";

import { AddToHomeScreenBanner } from "@/components/AddToHomeScreenBanner";
import { PlanningCenterSyncProvider } from "@/components/PlanningCenterSyncContext";

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  return (
    <PlanningCenterSyncProvider>
      <div className="app">
        <AddToHomeScreenBanner />
        <div className="app-body">{children}</div>
      </div>
    </PlanningCenterSyncProvider>
  );
}
