"use client";

import { useCallback, useEffect, useState } from "react";
import type { UpdatesStatus } from "@/components/AdminUpdatesSection";
import {
  dispatchAdminUpdateStatus,
  readCachedAdminUpdateAvailable,
  subscribeAdminUpdateStatus,
} from "@/lib/admin-update-events";
import { apiFetch } from "@/lib/api";

/** Match admin background refresh cadence for release availability. */
export const ADMIN_UPDATE_CHECK_MS = 10 * 60 * 1000;

function applyUpdateAvailable(
  updateAvailable: boolean,
  setUpdateAvailable: (value: boolean) => void,
  broadcast: boolean,
): void {
  setUpdateAvailable(updateAvailable);
  if (broadcast) {
    dispatchAdminUpdateStatus({ updateAvailable });
  }
}

export function useAdminUpdateAvailable(
  enabled: boolean,
  options?: { refreshWhen?: boolean },
): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(() =>
    enabled ? readCachedAdminUpdateAvailable() : false,
  );

  const refresh = useCallback(
    async (mode: "poll" | "menu" = "poll") => {
      if (!enabled) {
        setUpdateAvailable(false);
        return;
      }
      try {
        const path =
          mode === "menu" ? "/api/v1/settings/updates/check" : "/api/v1/settings/updates";
        const status = await apiFetch<UpdatesStatus>(path, mode === "menu" ? { method: "POST" } : undefined);
        applyUpdateAvailable(Boolean(status.updateAvailable), setUpdateAvailable, true);
      } catch {
        // Keep the last known state when refresh fails.
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setUpdateAvailable(false);
      return;
    }

    setUpdateAvailable(readCachedAdminUpdateAvailable());
    void refresh("poll");
    const intervalId = window.setInterval(() => void refresh("poll"), ADMIN_UPDATE_CHECK_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh("poll");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeAdminUpdateStatus(({ updateAvailable: next }) => {
      setUpdateAvailable(next);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !options?.refreshWhen) return;
    void refresh("menu");
  }, [enabled, options?.refreshWhen, refresh]);

  return updateAvailable;
}
