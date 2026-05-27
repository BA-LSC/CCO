"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  APP_UPDATE_EVENT,
  applyAppUpdate,
  clearDeployWait,
  DEPLOY_POLL_MS,
  isDeployPending,
  markDeployWait,
  probeServerAppVersion,
} from "@/lib/app-update";
export type UpdatesStatus = {
  platform: "cloudflare" | "vps" | "unknown";
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  autoUpdateEnabled: boolean;
  lastUpdateCheckAt: string | null;
  releasesBaseUrl: string | null;
  lastApplyError: string | null;
  canApply: boolean;
  applyBlockedReason: string | null;
  cloudflareApiTokenValid?: boolean | null;
  cloudflareApiTokenError?: string | null;
};

function shortenSha(value: string | null): string {
  if (!value) return "Unknown";
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function UpdatesFeedback({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  return (
    <p
      className={`integrations-feedback${error ? " integrations-feedback--error" : " integrations-feedback--success"}`}
      role={error ? "alert" : "status"}
    >
      {error ?? success}
    </p>
  );
}

function formatStatusLine(status: UpdatesStatus): string {
  const installed = shortenSha(status.currentVersion);
  const checked = formatWhen(status.lastUpdateCheckAt);

  if (status.updateAvailable) {
    const latest = shortenSha(status.latestVersion);
    return `Installed ${installed} · Latest ${latest} · Last checked ${checked}`;
  }

  return `Version ${installed} · Last checked ${checked}`;
}

export function AdminUpdatesSection({
  initialStatus = null,
  applyCloudflareApiToken,
}: {
  /** Hydrated from the admin page load so the card does not flash loading on mount. */
  initialStatus?: UpdatesStatus | null;
  /** When set, Apply update uses this token instead of the Secrets Store binding. */
  applyCloudflareApiToken?: string;
} = {}) {
  const [status, setStatus] = useState<UpdatesStatus | null>(initialStatus);
  const [busy, setBusy] = useState<"check" | "apply" | "toggle" | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const deployPollRef = useRef<number | null>(null);
  /** Avoid reloading before the API marks deploy draining (prepare can take several seconds). */
  const sawDeployUpdatingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates");
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (!deploying) return;

    let cancelled = false;

    const pollUntilReady = async () => {
      const { updating } = await probeServerAppVersion();
      if (cancelled) return;
      if (updating) {
        sawDeployUpdatingRef.current = true;
        return;
      }
      if (!sawDeployUpdatingRef.current) return;

      try {
        const next = await loadStatus();
        if (next.lastApplyError) {
          clearDeployWait();
          setDeploying(false);
          setFeedback({ error: `Apply failed: ${next.lastApplyError}` });
          return;
        }
        if (next.updateAvailable) {
          clearDeployWait();
          setDeploying(false);
          setFeedback({
            error:
              "Deploy finished but the release is still pending. Check for updates and try Apply again.",
          });
          return;
        }
      } catch {
        // Fall through to reload when status cannot be read.
      }

      void applyAppUpdate();
    };

    void pollUntilReady();
    deployPollRef.current = window.setInterval(() => void pollUntilReady(), DEPLOY_POLL_MS);

    return () => {
      cancelled = true;
      if (deployPollRef.current !== null) {
        window.clearInterval(deployPollRef.current);
        deployPollRef.current = null;
      }
    };
  }, [deploying, loadStatus]);

  useEffect(() => {
    const syncDeployPending = () => {
      if (isDeployPending()) {
        setDeploying(true);
      }
    };
    syncDeployPending();
    window.addEventListener(APP_UPDATE_EVENT, syncDeployPending);
    return () => window.removeEventListener(APP_UPDATE_EVENT, syncDeployPending);
  }, []);

  async function handleCheck() {
    setBusy("check");
    setFeedback({});
    try {
      const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates/check", {
        method: "POST",
      });
      setStatus(next);
      setFeedback({
        success: next.updateAvailable
          ? "A new release is available."
          : "You're on the latest release.",
      });
    } catch (err) {
      setFeedback({ error: err instanceof Error ? err.message : "Check failed" });
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!status) return;
    if (!status.canApply) {
      setFeedback({
        error:
          status.applyBlockedReason ??
          "Apply update is not available right now. Check for updates or fix the issue above, then try again.",
      });
      return;
    }
    setBusy("apply");
    setFeedback({});
    sawDeployUpdatingRef.current = false;
    markDeployWait({ showOverlay: false });
    setDeploying(true);
    try {
      const applyBody = applyCloudflareApiToken
        ? JSON.stringify({ cloudflareApiToken: applyCloudflareApiToken })
        : undefined;
      const result = await apiFetch<{
        ok: boolean;
        accepted?: boolean;
        appliedVersion: string;
        status: UpdatesStatus;
      }>("/api/v1/settings/updates/apply", {
        method: "POST",
        ...(applyBody
          ? { headers: { "Content-Type": "application/json" }, body: applyBody }
          : {}),
      });
      setStatus(result.status);
      const version = shortenSha(result.appliedVersion);
      const refreshNote =
        " This page will refresh automatically when the deploy finishes.";
      setFeedback({
        success: result.accepted
          ? `Update started (${version}). Workers are redeploying.${refreshNote}`
          : `Update applied (${version}). Workers are redeploying.${refreshNote}`,
      });
    } catch (err) {
      clearDeployWait();
      setDeploying(false);
      setFeedback({ error: err instanceof Error ? err.message : "Apply failed" });
      await loadStatus();
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAutoUpdate(enabled: boolean) {
    setBusy("toggle");
    setFeedback({});
    try {
      const next = await apiFetch<UpdatesStatus & { ok: boolean }>("/api/v1/settings/updates", {
        method: "PATCH",
        body: JSON.stringify({ autoUpdateEnabled: enabled }),
      });
      setStatus(next);
      setFeedback({
        success: enabled ? "Automatic updates enabled." : "Automatic updates disabled.",
      });
    } catch (err) {
      setFeedback({
        error: err instanceof Error ? err.message : "Failed to save setting",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return (
      <section className="integrations-section" aria-labelledby="updates-status-heading">
        <div className="integrations-section-top">
          <div className="integrations-section-head">
            <h2 id="updates-status-heading">Updates</h2>
            <p>Install the latest release from your connected repository.</p>
          </div>
        </div>
        <UpdatesFeedback error={feedback.error} success={feedback.success} />
        <div className="integrations-actions">
          <button
            type="button"
            className="btn btn-secondary integrations-action-btn"
            disabled={busy !== null}
            onClick={() => void handleCheck()}
          >
            {busy === "check" ? "Checking…" : "Check for updates"}
          </button>
        </div>
      </section>
    );
  }

  const statusBadge = status.updateAvailable
    ? { label: "Update available", variant: "update" as const }
    : { label: "Up to date", variant: "success" as const };

  const isUpdating = deploying || isDeployPending();
  const controlsDisabled = busy !== null || isUpdating;

  return (
    <section className="integrations-section" aria-labelledby="updates-status-heading">
      <div className="integrations-section-top">
        <div className="integrations-section-head">
          <h2 id="updates-status-heading">Updates</h2>
          <p>Install the latest release from your connected repository.</p>
        </div>
        <div className="integrations-section-badges">
          <span className={`integrations-badge integrations-badge--${statusBadge.variant}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <p className="integrations-inline-status integrations-field-hint">{formatStatusLine(status)}</p>

      {status.cloudflareApiTokenValid === false && status.cloudflareApiTokenError && (
        <p className="integrations-feedback integrations-feedback--error" role="alert">
          Cloudflare token invalid: {status.cloudflareApiTokenError}
        </p>
      )}

      {status.lastApplyError && (
        <p className="integrations-feedback integrations-feedback--error" role="alert">
          Last apply failed: {status.lastApplyError}
          {status.canApply
            ? " Apply update will redeploy the current release to recover."
            : null}
        </p>
      )}

      <UpdatesFeedback error={feedback.error} success={feedback.success} />

      {isUpdating && (
        <div className="integrations-updates-deploying" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Updating CCO…</span>
        </div>
      )}

      <div className="integrations-actions">
        <button
          type="button"
          className="btn btn-secondary integrations-action-btn"
          disabled={controlsDisabled}
          onClick={() => void handleCheck()}
        >
          {busy === "check" ? "Checking…" : "Check for updates"}
        </button>
        <button
          type="button"
          className="btn btn-primary integrations-action-btn"
          disabled={controlsDisabled}
          aria-disabled={!status.canApply}
          onClick={() => void handleApply()}
        >
          {busy === "apply" || isUpdating
            ? "Applying…"
            : status.lastApplyError && status.canApply
              ? "Retry apply"
              : "Apply update"}
        </button>
      </div>

      {!status.canApply && status.applyBlockedReason && (
        <p className="integrations-field-hint">{status.applyBlockedReason}</p>
      )}

      {status.platform === "cloudflare" && (
        <>
          <label className="integrations-toggle">
            <span className="integrations-toggle-label">Auto-install updates</span>
            <input
              type="checkbox"
              role="switch"
              checked={status.autoUpdateEnabled}
              disabled={controlsDisabled}
              onChange={(event) => void handleToggleAutoUpdate(event.target.checked)}
              aria-label="Auto-install updates"
            />
            <span className="toggle-switch" aria-hidden="true" />
          </label>
          <p className="integrations-field-hint">
            Checked every 6 hours.
          </p>
        </>
      )}
    </section>
  );
}
