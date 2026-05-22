"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { fetchSetupStatus } from "@/lib/setup";

type PlanningCenterSyncContextValue = {
  groupsSyncing: boolean;
  teamsSyncing: boolean;
  syncError: string | null;
  needsReconnect: boolean;
  webhooksEnabled: boolean | null;
  syncGroups: () => Promise<void>;
  syncTeams: () => Promise<void>;
  syncPco: () => Promise<void>;
  registerSidebarReload: (reload: () => Promise<void>) => () => void;
};

const PlanningCenterSyncContext = createContext<PlanningCenterSyncContextValue | null>(null);

export function PlanningCenterSyncProvider({ children }: { children: ReactNode }) {
  const [groupsSyncing, setGroupsSyncing] = useState(false);
  const [teamsSyncing, setTeamsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [webhooksEnabled, setWebhooksEnabled] = useState<boolean | null>(null);
  const reloadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    void fetchSetupStatus().then((status) => {
      setWebhooksEnabled(status.webhooksEnabled ?? false);
    });
  }, []);

  const registerSidebarReload = useCallback((reload: () => Promise<void>) => {
    reloadRef.current = reload;
    return () => {
      if (reloadRef.current === reload) reloadRef.current = null;
    };
  }, []);

  const reloadSidebar = useCallback(async () => {
    await reloadRef.current?.();
  }, []);

  const syncGroups = useCallback(async () => {
    setGroupsSyncing(true);
    setSyncError(null);
    setNeedsReconnect(false);
    try {
      await apiFetch("/api/v1/groups/sync", { method: "POST" });
      await reloadSidebar();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Group sync failed";
      setSyncError(message);
      if (message.toLowerCase().includes("reconnect") || message.includes("Groups access")) {
        setNeedsReconnect(true);
      }
    } finally {
      setGroupsSyncing(false);
    }
  }, [reloadSidebar]);

  const syncTeams = useCallback(async () => {
    setTeamsSyncing(true);
    setSyncError(null);
    try {
      await apiFetch("/api/v1/services/teams/sync", { method: "POST" });
      await reloadSidebar();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Team sync failed");
    } finally {
      setTeamsSyncing(false);
    }
  }, [reloadSidebar]);

  const syncPco = useCallback(async () => {
    setGroupsSyncing(true);
    setTeamsSyncing(true);
    setSyncError(null);
    setNeedsReconnect(false);
    try {
      try {
        await apiFetch("/api/v1/groups/sync", { method: "POST" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Group sync failed";
        setSyncError(message);
        if (message.toLowerCase().includes("reconnect") || message.includes("Groups access")) {
          setNeedsReconnect(true);
        }
      }

      try {
        await apiFetch("/api/v1/services/teams/sync", { method: "POST" });
      } catch (err) {
        setSyncError((current) => current ?? (err instanceof Error ? err.message : "Team sync failed"));
      }

      await reloadSidebar();
    } finally {
      setGroupsSyncing(false);
      setTeamsSyncing(false);
    }
  }, [reloadSidebar]);

  return (
    <PlanningCenterSyncContext.Provider
      value={{
        groupsSyncing,
        teamsSyncing,
        syncError,
        needsReconnect,
        webhooksEnabled,
        syncGroups,
        syncTeams,
        syncPco,
        registerSidebarReload,
      }}
    >
      {children}
    </PlanningCenterSyncContext.Provider>
  );
}

export function usePlanningCenterSync() {
  return useContext(PlanningCenterSyncContext);
}
