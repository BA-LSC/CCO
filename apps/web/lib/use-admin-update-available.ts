"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { UpdatesStatus } from "@/components/AdminUpdatesSection";

/** Match admin background refresh cadence for release availability. */
export const ADMIN_UPDATE_CHECK_MS = 10 * 60 * 1000;

export function useAdminUpdateAvailable(
  enabled: boolean,
  options?: { refreshWhen?: boolean },
): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setUpdateAvailable(false);
      return;
    }
    try {
      const status = await apiFetch<UpdatesStatus>("/api/v1/settings/updates");
      setUpdateAvailable(Boolean(status.updateAvailable));
    } catch {
      // Keep the last known state when refresh fails.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setUpdateAvailable(false);
      return;
    }

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), ADMIN_UPDATE_CHECK_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !options?.refreshWhen) return;
    void refresh();
  }, [enabled, options?.refreshWhen, refresh]);

  return updateAvailable;
}
