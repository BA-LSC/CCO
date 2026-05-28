"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { UpdatesStatus } from "@/components/AdminUpdatesSection";
import { apiFetch } from "@/lib/api";
import {
  clearDeployWait,
  isDeployPending,
  markDeployWait,
} from "@/lib/app-update";
import { useAdminUpdateAvailable } from "@/lib/use-admin-update-available";
import { useDeployCompletionPoll } from "@/lib/use-deploy-completion-poll";

function isAdminSettingsPath(pathname: string): boolean {
  return pathname === "/settings/admin" || pathname.startsWith("/settings/admin/");
}

export function AdminUpdateApplyBanner() {
  const pathname = usePathname();
  const { session, sessionLoading } = useChatLayout();
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<UpdatesStatus | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateAvailable = useAdminUpdateAvailable(
    !sessionLoading && isAdmin && !isAdminSettingsPath(pathname),
  );

  useEffect(() => {
    if (sessionLoading || !session?.userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void apiFetch<{ siteAdministrator?: boolean }>("/api/v1/session/me")
      .then((me) => {
        if (!cancelled) setIsAdmin(Boolean(me.siteAdministrator));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId, sessionLoading]);

  useEffect(() => {
    if (!updateAvailable || isAdminSettingsPath(pathname)) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    void apiFetch<UpdatesStatus>("/api/v1/settings/updates")
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [updateAvailable, pathname]);

  const validateBeforeReload = useCallback(async () => {
    try {
      const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates");
      setStatus(next);
      if (next.lastApplyError) {
        clearDeployWait();
        setApplying(false);
        setError(`Apply failed: ${next.lastApplyError}`);
        return "abort" as const;
      }
    } catch {
      // Fall through to reload when status cannot be read.
    }
    return "reload" as const;
  }, []);

  useDeployCompletionPoll({
    deploying: applying,
    validateBeforeReload,
  });

  const handleApply = useCallback(async () => {
    if (!status?.canApply) {
      setError(
        status?.applyBlockedReason ??
          "Apply update is not available right now. Open Admin Settings for details.",
      );
      return;
    }
    setError(null);
    setApplying(true);
    markDeployWait();
    try {
      const result = await apiFetch<{
        ok: boolean;
        status: UpdatesStatus;
      }>("/api/v1/settings/updates/apply", { method: "POST" });
      setStatus(result.status);
    } catch (err) {
      clearDeployWait();
      setApplying(false);
      setError(err instanceof Error ? err.message : "Apply failed");
    }
  }, [status]);

  if (
    sessionLoading ||
    !isAdmin ||
    isAdminSettingsPath(pathname) ||
    !updateAvailable ||
    isDeployPending() ||
    applying
  ) {
    return null;
  }

  const canApply = status?.canApply ?? false;

  return (
    <ChatHomeBanner
      variant="neutral"
      placement="fixed"
      actions={
        <>
          <button
            type="button"
            className="chat-home-banner-btn chat-home-banner-btn--answer"
            disabled={!canApply}
            onClick={() => void handleApply()}
          >
            Apply update
          </button>
          <a href="/settings/admin" className="chat-home-banner-btn">
            Admin Settings
          </a>
        </>
      }
    >
      <span className="chat-home-banner-body">
        {error ?? "A new CCO release is available."}
        {!canApply && status?.applyBlockedReason ? ` ${status.applyBlockedReason}` : null}
      </span>
    </ChatHomeBanner>
  );
}
