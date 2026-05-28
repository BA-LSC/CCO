"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES,
  formatReleaseShaPair,
  isUpdateAvailable,
} from "@cco/shared";
import { IntegrationsFeedbackToast } from "@/components/IntegrationsFeedbackToast";
import { apiFetch } from "@/lib/api";
import { dispatchAdminUpdateStatus } from "@/lib/admin-update-events";
import { clearDeployWait, isDeployPending, markDeployWait } from "@/lib/app-update";
import { resolveDeployStatusMessage } from "@/lib/deploy-phase";
import {
  useDeployCompletionPoll,
  validateUpdatesReload,
} from "@/lib/use-deploy-completion-poll";
export type UpdatesStatus = {
  platform: "cloudflare" | "unknown";
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  autoUpdateEnabled: boolean;
  autoUpdateCheckIntervalMinutes: number;
  lastUpdateCheckAt: string | null;
  releasesBaseUrl: string | null;
  lastApplyError: string | null;
  canApply: boolean;
  applyBlockedReason: string | null;
  cloudflareApiTokenValid?: boolean | null;
  cloudflareApiTokenError?: string | null;
  gitRepoUrl: string;
};

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

function UpdatesStatusMeta({ status }: { status: UpdatesStatus }) {
  const { installed, latest } = formatReleaseShaPair(
    status.currentVersion,
    status.latestVersion,
  );
  const checked = formatWhen(status.lastUpdateCheckAt);
  const showLatest =
    status.latestVersion != null &&
    isUpdateAvailable(status.currentVersion, status.latestVersion);

  return (
    <div className="integrations-inline-status integrations-field-hint">
      <p>{showLatest ? <>Installed {installed}</> : <>Version {installed}</>}</p>
      {showLatest ? <p>Latest {latest}</p> : null}
      <p>Last checked {checked}</p>
    </div>
  );
}

export function AdminUpdatesSection({
  initialStatus,
  applyCloudflareApiToken,
}: {
  /** Hydrated from the admin page load so the card does not flash loading on mount. */
  initialStatus: UpdatesStatus | null;
  /** When set, Apply update uses this token instead of the Secrets Store binding. */
  applyCloudflareApiToken?: string;
}) {
  const [status, setStatus] = useState<UpdatesStatus | null>(initialStatus);
  const [busy, setBusy] = useState<"check" | "apply" | "toggle" | "interval" | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(
    initialStatus?.autoUpdateCheckIntervalMinutes ?? 360,
  );
  const [deploying, setDeploying] = useState(false);
  const [deployStatusMessage, setDeployStatusMessage] = useState("Starting update…");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const deployStartedAtRef = useRef<number | null>(null);
  const backgroundRefreshStartedRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates");
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (status?.autoUpdateCheckIntervalMinutes != null) {
      setIntervalMinutes(status.autoUpdateCheckIntervalMinutes);
    }
  }, [status?.autoUpdateCheckIntervalMinutes]);

  useEffect(() => {
    if (!status) return;
    const updateAvailable =
      status.latestVersion != null &&
      isUpdateAvailable(status.currentVersion, status.latestVersion);
    dispatchAdminUpdateStatus({ updateAvailable });
  }, [status]);

  useEffect(() => {
    if (deploying || !isDeployPending()) return;
    deployStartedAtRef.current = Date.now();
    setDeploying(true);
    setDeployStatusMessage(
      resolveDeployStatusMessage({ updating: true, elapsedMs: 0 }),
    );
  }, [deploying]);

  useEffect(() => {
    if (!initialStatus || backgroundRefreshStartedRef.current) return;
    backgroundRefreshStartedRef.current = true;
    void loadStatus().catch(() => {
      // Keep hydrated snapshot when background refresh fails.
    });
  }, [initialStatus, loadStatus]);

  const refreshDeployStatusMessage = useCallback(
    (updating: boolean, deployPhase: string | null) => {
      const elapsedMs = deployStartedAtRef.current
        ? Date.now() - deployStartedAtRef.current
        : 0;
      setDeployStatusMessage(
        resolveDeployStatusMessage({ phase: deployPhase, updating, elapsedMs }),
      );
    },
    [],
  );

  const validateBeforeReload = useCallback(async () => {
    try {
      const next = await loadStatus();
      return validateUpdatesReload(next, (message) => {
        setDeploying(false);
        setFeedback({ error: message });
      });
    } catch {
      return "reload" as const;
    }
  }, [loadStatus]);

  useDeployCompletionPoll({
    deploying,
    validateBeforeReload,
    onDeployStatusMessage: (message) => setDeployStatusMessage(message),
  });

  async function handleCheck() {
    setBusy("check");
    setFeedback({});
    try {
      const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates/check", {
        method: "POST",
      });
      setStatus(next);
      if (!next.latestVersion) {
        setFeedback({
          error:
            next.applyBlockedReason ??
            "Could not load the latest release. Try again in a moment.",
        });
        return;
      }
      const updateAvailable =
        next.latestVersion != null &&
        isUpdateAvailable(next.currentVersion, next.latestVersion);
      setFeedback({
        success: updateAvailable
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
    deployStartedAtRef.current = Date.now();
    setDeployStatusMessage(resolveDeployStatusMessage({ updating: true, elapsedMs: 0 }));
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
      refreshDeployStatusMessage(true, null);
      setFeedback({});
    } catch (err) {
      clearDeployWait();
      setDeploying(false);
      deployStartedAtRef.current = null;
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

  async function handleSaveAutoUpdateInterval() {
    if (!status) return;
    const clamped = Math.max(
      AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES,
      Math.floor(Number(intervalMinutes)) || AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES,
    );
    if (clamped === status.autoUpdateCheckIntervalMinutes) return;

    setBusy("interval");
    setFeedback({});
    try {
      const next = await apiFetch<UpdatesStatus & { ok: boolean }>("/api/v1/settings/updates", {
        method: "PATCH",
        body: JSON.stringify({ autoUpdateCheckIntervalMinutes: clamped }),
      });
      setStatus(next);
      setIntervalMinutes(next.autoUpdateCheckIntervalMinutes);
      setFeedback({ success: `Auto-install check interval set to ${clamped} minutes.` });
    } catch (err) {
      setFeedback({
        error: err instanceof Error ? err.message : "Failed to save interval",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return null;
  }

  const updateAvailable =
    status.latestVersion != null &&
    isUpdateAvailable(status.currentVersion, status.latestVersion);

  const statusBadge = updateAvailable
    ? { label: "Update available", variant: "update" as const }
    : status.latestVersion
      ? { label: "Up to date", variant: "success" as const }
      : status.lastUpdateCheckAt
        ? { label: "Check failed", variant: "muted" as const }
        : { label: "Not checked yet", variant: "muted" as const };

  const isUpdating = deploying;
  const controlsDisabled = busy !== null || isUpdating;
  const showApplyButton =
    updateAvailable || (Boolean(status.lastApplyError) && status.canApply);

  return (
    <section className="integrations-section" aria-labelledby="updates-status-heading">
      <div className="integrations-section-top">
        <div className="integrations-section-head">
          <h2 id="updates-status-heading">Updates</h2>
        </div>
        <div className="integrations-section-badges">
          <span className={`integrations-badge integrations-badge--${statusBadge.variant}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <UpdatesStatusMeta status={status} />

      {status.lastUpdateCheckAt && !status.latestVersion && status.applyBlockedReason ? (
        <p className="integrations-feedback integrations-feedback--error" role="alert">
          {status.applyBlockedReason}
        </p>
      ) : null}

      {status.cloudflareApiTokenValid === false && status.cloudflareApiTokenError && (
        <p className="integrations-feedback integrations-feedback--error" role="alert">
          Cloudflare token invalid: {status.cloudflareApiTokenError}
        </p>
      )}

      {status.lastApplyError && (
        <>
          <p className="integrations-feedback integrations-feedback--error" role="alert">
            Last apply failed: {status.lastApplyError}
            {status.canApply && !status.lastApplyError.includes("node:https")
              ? " Apply update will redeploy the current release to recover."
              : null}
          </p>
          {status.lastApplyError.includes("node:https") ? (
            <p className="integrations-feedback integrations-feedback--error" role="alert">
              Admin Apply cannot fix this by itself — the API worker must be redeployed once from a
              machine with the CCO repo and your Cloudflare API token: run{" "}
              <code>bun deploy/cloudflare/recover-api-nodejs-compat.ts</code> (see{" "}
              <code>deploy/cloudflare/README.md</code>), then retry Apply.
            </p>
          ) : null}
        </>
      )}

      {isUpdating && (
        <div className="integrations-updates-deploying" role="status" aria-live="polite">
          <div className="integrations-updates-deploying-head">
            <span className="integrations-updates-deploying-label">Updating CCO…</span>
          </div>
          <p
            className="integrations-feedback integrations-feedback--success integrations-updates-deploying-detail"
            role="status"
          >
            {deployStatusMessage}
          </p>
          <div className="integrations-updates-progress" aria-hidden="true">
            <div className="integrations-updates-progress-bar" />
          </div>
        </div>
      )}

      <IntegrationsFeedbackToast
        error={feedback.error}
        success={isUpdating ? undefined : feedback.success}
        onDismiss={() => setFeedback({})}
      />

      <div className="integrations-actions">
        <button
          type="button"
          className="btn btn-secondary integrations-action-btn"
          disabled={controlsDisabled}
          onClick={() => void handleCheck()}
        >
          {busy === "check" ? "Checking…" : "Check for updates"}
        </button>
        {showApplyButton ? (
          <button
            type="button"
            className="btn btn-primary integrations-action-btn"
            disabled={controlsDisabled || !status.canApply}
            onClick={() => void handleApply()}
          >
            {busy === "apply" || isUpdating
              ? "Applying…"
              : status.lastApplyError && status.canApply
                ? "Retry apply"
                : "Apply update"}
          </button>
        ) : null}
      </div>

      {showApplyButton && !status.canApply && status.applyBlockedReason && (
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
          {status.autoUpdateEnabled ? (
            <div className="integrations-fields integrations-auto-update-fields">
              <label className="integrations-field">
                <span className="integrations-field-label">Check interval (minutes)</span>
                <input
                  type="number"
                  className="integrations-input"
                  min={AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES}
                  step={1}
                  value={intervalMinutes}
                  disabled={controlsDisabled || busy === "interval"}
                  onChange={(event) => setIntervalMinutes(Number(event.target.value))}
                  onBlur={() => void handleSaveAutoUpdateInterval()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveAutoUpdateInterval();
                    }
                  }}
                  aria-describedby="auto-update-interval-hint"
                />
                <span id="auto-update-interval-hint" className="integrations-field-hint">
                  Minimum {AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES} minutes. CCO checks for
                  releases on this schedule and applies updates when one is available.
                </span>
              </label>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
