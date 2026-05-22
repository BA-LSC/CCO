"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

const HEARTBEAT_MS = 15_000;

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
  const watchedUserIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const update = () => setPageActive(readPageActive());

    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);

    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

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

  const refreshWatchedPresence = useCallback(async () => {
    const ids = [...watchedUserIdsRef.current];
    if (ids.length > 0) await refreshPresence(ids);
  }, [refreshPresence]);

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

  useEffect(() => {
    if (!pageActive) return;

    void refreshWatchedPresence();
    const intervalId = window.setInterval(() => void refreshWatchedPresence(), HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [pageActive, refreshWatchedPresence]);

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

  return (
    <PresenceContext.Provider value={value}>
      <PresenceWatchRegistry watchedUserIdsRef={watchedUserIdsRef}>
        {children}
      </PresenceWatchRegistry>
    </PresenceContext.Provider>
  );
}

const PresenceWatchRegistryContext = createContext<React.MutableRefObject<Set<string>> | null>(
  null,
);

function PresenceWatchRegistry({
  watchedUserIdsRef,
  children,
}: {
  watchedUserIdsRef: React.MutableRefObject<Set<string>>;
  children: ReactNode;
}) {
  return (
    <PresenceWatchRegistryContext.Provider value={watchedUserIdsRef}>
      {children}
    </PresenceWatchRegistryContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used within PresenceProvider");
  return ctx;
}

/** Register user ids to poll for presence while mounted. */
export function usePresenceWatch(
  userIds: Array<string | null | undefined>,
  enabled = true,
): void {
  const watchedUserIdsRef = useContext(PresenceWatchRegistryContext);
  const { refreshPresence } = usePresence();

  const watchKey = useMemo(
    () =>
      [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
        .sort()
        .join(","),
    [userIds],
  );

  useEffect(() => {
    if (!watchedUserIdsRef || !enabled || !watchKey) return;

    const ids = watchKey.split(",");
    for (const id of ids) watchedUserIdsRef.current.add(id);

    void refreshPresence(ids);

    return () => {
      for (const id of ids) watchedUserIdsRef.current.delete(id);
    };
  }, [enabled, refreshPresence, watchKey, watchedUserIdsRef]);
}
