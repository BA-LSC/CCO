"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

const HEARTBEAT_MS = 25_000;

type PresenceContextValue = {
  pageActive: boolean;
  isUserOnline: (userId: string | null | undefined) => boolean;
  refreshPresence: (userIds: string[]) => Promise<void>;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

function readPageActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

export function PresenceProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const [pageActive, setPageActive] = useState(readPageActive);
  const [onlineByUserId, setOnlineByUserId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const update = () => setPageActive(readPageActive());

    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);

    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  useEffect(() => {
    if (!userId || !pageActive) return;

    const ping = () => {
      void apiFetch("/api/v1/presence/heartbeat", { method: "POST" }).catch(() => {
        // Ignore transient network errors.
      });
    };

    ping();
    const intervalId = window.setInterval(ping, HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [pageActive, userId]);

  const refreshPresence = useCallback(async (userIds: string[]) => {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return;

    try {
      const data = await apiFetch<{ online: Record<string, boolean> }>("/api/v1/presence/query", {
        method: "POST",
        body: JSON.stringify({ userIds: unique }),
      });
      setOnlineByUserId((prev) => ({ ...prev, ...data.online }));
    } catch {
      // Ignore transient network errors.
    }
  }, []);

  const isUserOnline = useCallback(
    (targetUserId: string | null | undefined) => {
      if (!targetUserId) return false;
      if (targetUserId === userId) return pageActive;
      return onlineByUserId[targetUserId] ?? false;
    },
    [onlineByUserId, pageActive, userId],
  );

  const value = useMemo(
    () => ({ pageActive, isUserOnline, refreshPresence }),
    [isUserOnline, pageActive, refreshPresence],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used within PresenceProvider");
  return ctx;
}

/** Poll presence for the given user ids while enabled (e.g. settings panel open). */
export function usePresenceWatch(
  userIds: Array<string | null | undefined>,
  enabled = true,
): void {
  const { refreshPresence } = usePresence();

  const watchKey = useMemo(
    () =>
      [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
        .sort()
        .join(","),
    [userIds],
  );

  useEffect(() => {
    if (!enabled || !watchKey) return;

    const ids = watchKey.split(",");
    void refreshPresence(ids);
    const intervalId = window.setInterval(() => void refreshPresence(ids), HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled, refreshPresence, watchKey]);
}
