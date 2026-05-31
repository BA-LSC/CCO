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
import {
  normalizeUserStatusPreset,
  parseUserStatusPreset,
  resolveEffectivePreset,
  isPresenceConnected,
  resolvePresenceDotState,
  type UserStatus,
  type UserStatusPreset,
} from "@cco/shared/user-status";
import { apiFetch } from "@/lib/api";
import { useChatLayout } from "@/components/ChatLayoutContext";

const HEARTBEAT_MS = 8_000;
const IDLE_MS = 5 * 60 * 1000;
const MAX_PRESENCE_QUERY_IDS = 200;

type PresenceContextValue = {
  pageActive: boolean;
  idle: boolean;
  myStatus: UserStatus;
  effectivePreset: UserStatusPreset;
  isUserOnline: (userId: string | null | undefined) => boolean;
  getUserStatus: (userId: string | null | undefined) => UserStatus;
  setMyStatus: (update: Partial<UserStatus>) => Promise<void>;
  markUserActive: () => void;
  refreshPresence: (userIds: string[]) => Promise<void>;
  applyPresenceUpdate: (userId: string, online: boolean) => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

const DEFAULT_STATUS: UserStatus = { preset: "active", message: null };

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
  const [statusByUserId, setStatusByUserId] = useState<Record<string, UserStatus>>({});
  const [myStatus, setMyStatusState] = useState<UserStatus>(DEFAULT_STATUS);
  const [idle, setIdle] = useState(false);
  const watchedUserIdsRef = useRef(new Set<string>());
  const lastActivityRef = useRef(Date.now());

  const markUserActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdle(false);
  }, []);

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
    if (!userId || !pageActive) {
      setIdle(false);
      return;
    }

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      setIdle(false);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const intervalId = window.setInterval(() => {
      setIdle(Date.now() - lastActivityRef.current >= IDLE_MS);
    }, 1000);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
      window.clearInterval(intervalId);
    };
  }, [pageActive, userId]);

  useEffect(() => {
    if (!userId) {
      setMyStatusState(DEFAULT_STATUS);
      return;
    }

    void apiFetch<{
      statusPreset: UserStatusPreset;
      statusMessage: string | null;
    }>("/api/v1/session/me")
      .then((data) => {
        const status: UserStatus = {
          preset: parseUserStatusPreset(data.statusPreset),
          message: data.statusMessage,
        };
        setMyStatusState(status);
        setStatusByUserId((prev) => ({ ...prev, [userId]: status }));
      })
      .catch(() => {
        // Ignore transient network errors.
      });
  }, [userId]);

  const refreshPresence = useCallback(async (userIds: string[]) => {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return;

    try {
      for (let index = 0; index < unique.length; index += MAX_PRESENCE_QUERY_IDS) {
        const chunk = unique.slice(index, index + MAX_PRESENCE_QUERY_IDS);
        const data = await apiFetch<{
          online: Record<string, boolean>;
          statuses: Record<string, UserStatus>;
        }>("/api/v1/presence/query", {
          method: "POST",
          body: JSON.stringify({ userIds: chunk }),
        });
        setOnlineByUserId((prev) => ({ ...prev, ...data.online }));
        if (data.statuses) {
          setStatusByUserId((prev) => ({ ...prev, ...data.statuses }));
        }
      }
    } catch {
      // Ignore transient network errors.
    }
  }, []);

  const applyPresenceUpdate = useCallback((targetUserId: string, online: boolean) => {
    setOnlineByUserId((prev) => ({ ...prev, [targetUserId]: online }));
  }, []);

  const refreshWatchedPresence = useCallback(async () => {
    const ids = [...watchedUserIdsRef.current];
    if (ids.length > 0) await refreshPresence(ids);
  }, [refreshPresence]);

  useEffect(() => {
    if (!userId || !pageActive || normalizeUserStatusPreset(myStatus.preset) === "offline") return;

    const ping = () => {
      void apiFetch("/api/v1/presence/heartbeat", { method: "POST" }).catch(() => {
        // Ignore transient network errors.
      });
    };

    ping();
    const intervalId = window.setInterval(ping, HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [myStatus.preset, pageActive, userId]);

  useEffect(() => {
    if (!pageActive) return;

    void refreshWatchedPresence();
    const intervalId = window.setInterval(() => void refreshWatchedPresence(), HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [pageActive, refreshWatchedPresence]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refreshWatchedPresence();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refreshWatchedPresence]);

  const isUserOnline = useCallback(
    (targetUserId: string | null | undefined) => {
      if (!targetUserId) return false;
      if (targetUserId === userId) {
        return isPresenceConnected(myStatus.preset, pageActive);
      }
      const status = statusByUserId[targetUserId];
      const connected = onlineByUserId[targetUserId] ?? false;
      if (!status) return connected;
      return isPresenceConnected(status.preset, connected);
    },
    [myStatus.preset, onlineByUserId, pageActive, statusByUserId, userId],
  );

  const effectivePreset = useMemo(
    () => resolveEffectivePreset(myStatus, { pageActive, idle }),
    [idle, myStatus, pageActive],
  );

  const getUserStatus = useCallback(
    (targetUserId: string | null | undefined): UserStatus => {
      if (!targetUserId) return DEFAULT_STATUS;
      if (targetUserId === userId) {
        return { ...myStatus, preset: normalizeUserStatusPreset(myStatus.preset) };
      }
      return statusByUserId[targetUserId] ?? DEFAULT_STATUS;
    },
    [myStatus, statusByUserId, userId],
  );

  const setMyStatus = useCallback(
    async (update: Partial<UserStatus>) => {
      if (!userId) return;

      const payload: Record<string, unknown> = {};
      if (update.preset !== undefined) payload.preset = update.preset;
      if (update.message !== undefined) payload.message = update.message;

      const data = await apiFetch<{
        statusPreset: UserStatusPreset;
        statusMessage: string | null;
      }>("/api/v1/session/me/status", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const next: UserStatus = {
        preset: parseUserStatusPreset(data.statusPreset),
        message: data.statusMessage,
      };
      setMyStatusState(next);
      setStatusByUserId((prev) => ({ ...prev, [userId]: next }));
    },
    [userId],
  );

  const value = useMemo(
    () => ({
      pageActive,
      idle,
      myStatus,
      effectivePreset,
      isUserOnline,
      getUserStatus,
      setMyStatus,
      markUserActive,
      refreshPresence,
      applyPresenceUpdate,
    }),
    [
      applyPresenceUpdate,
      effectivePreset,
      getUserStatus,
      idle,
      isUserOnline,
      markUserActive,
      myStatus,
      pageActive,
      refreshPresence,
      setMyStatus,
    ],
  );

  return (
    <PresenceContext.Provider value={value}>
      <PresenceWatchRegistry watchedUserIdsRef={watchedUserIdsRef}>
        <PresenceRealtimeSync />
        {children}
      </PresenceWatchRegistry>
    </PresenceContext.Provider>
  );
}

function PresenceRealtimeSync() {
  const { subscribeRealtime } = useChatLayout();
  const { applyPresenceUpdate, refreshPresence } = usePresence();
  const watchedUserIdsRef = useContext(PresenceWatchRegistryContext);

  useEffect(() => {
    return subscribeRealtime((event) => {
      if (event.type !== "presence.updated") return;
      if (!watchedUserIdsRef?.current.has(event.userId)) return;
      applyPresenceUpdate(event.userId, event.online);
      if (event.online) {
        void refreshPresence([event.userId]);
      }
    });
  }, [applyPresenceUpdate, refreshPresence, subscribeRealtime, watchedUserIdsRef]);

  return null;
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

export { resolveEffectivePreset, resolvePresenceDotState };
