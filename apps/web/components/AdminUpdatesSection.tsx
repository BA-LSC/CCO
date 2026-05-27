"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { clearDeployWait, markDeployWait } from "@/lib/app-update";
import { CCO_DEFAULT_GIT_REPO_URL } from "@cco/shared";

type UpdatesStatus = {
  platform: "cloudflare" | "vps" | "unknown";
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  autoUpdateEnabled: boolean;
  lastUpdateCheckAt: string | null;
  latestPublishedAt: string | null;
  releasesBaseUrl: string | null;
  gitRepoUrl: string;
  lastApplyError: string | null;
  canApply: boolean;
  applyBlockedReason: string | null;
};

function shortenSha(value: string | null): string {
  if (!value) return "Unknown";
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

type AdminUpdatesSectionProps = {
  initialGitRepoUrl?: string;
  onFeedback?: (message: { error?: string; success?: string }) => void;
};

export function AdminUpdatesSection({
  initialGitRepoUrl = CCO_DEFAULT_GIT_REPO_URL,
  onFeedback,
}: AdminUpdatesSectionProps) {
  const [status, setStatus] = useState<UpdatesStatus | null>(null);
  const [gitRepoUrl, setGitRepoUrl] = useState(initialGitRepoUrl);
  const [busy, setBusy] = useState<"check" | "apply" | "toggle" | "saveRepo" | null>(null);

  const loadStatus = useCallback(async () => {
    const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates");
    setStatus(next);
    setGitRepoUrl(next.gitRepoUrl);
    return next;
  }, []);

  useEffect(() => {
    void loadStatus().catch((err) => {
      onFeedback?.({
        error: err instanceof Error ? err.message : "Failed to load updates",
      });
    });
  }, [loadStatus, onFeedback]);

  async function handleCheck() {
    setBusy("check");
    onFeedback?.({});
    try {
      const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates/check", {
        method: "POST",
      });
      setStatus(next);
      onFeedback?.({
        success: next.updateAvailable
          ? "A new release is available."
          : "You're on the latest release.",
      });
    } catch (err) {
      onFeedback?.({ error: err instanceof Error ? err.message : "Check failed" });
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!status?.canApply) return;
    setBusy("apply");
    onFeedback?.({});
    markDeployWait();
    try {
      const result = await apiFetch<{
        ok: boolean;
        accepted?: boolean;
        appliedVersion: string;
        status: UpdatesStatus;
      }>("/api/v1/settings/updates/apply", { method: "POST" });
      setStatus(result.status);
      const version = shortenSha(result.appliedVersion);
      const refreshNote =
        " This page will refresh automatically when the deploy finishes.";
      onFeedback?.({
        success: result.accepted
          ? `Update started (${version}). Workers are redeploying.${refreshNote}`
          : `Update applied (${version}). Workers are redeploying.${refreshNote}`,
      });
    } catch (err) {
      clearDeployWait();
      onFeedback?.({ error: err instanceof Error ? err.message : "Apply failed" });
      await loadStatus();
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAutoUpdate(enabled: boolean) {
    setBusy("toggle");
    onFeedback?.({});
    try {
      const next = await apiFetch<UpdatesStatus & { ok: boolean }>("/api/v1/settings/updates", {
        method: "PATCH",
        body: JSON.stringify({ autoUpdateEnabled: enabled }),
      });
      setStatus(next);
      onFeedback?.({
        success: enabled ? "Automatic updates enabled." : "Automatic updates disabled.",
      });
    } catch (err) {
      onFeedback?.({
        error: err instanceof Error ? err.message : "Failed to save setting",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveGitRepo(e: React.FormEvent) {
    e.preventDefault();
    setBusy("saveRepo");
    onFeedback?.({});
    try {
      await apiFetch("/api/v1/settings/integrations", {
        method: "PATCH",
        body: JSON.stringify({ gitRepoUrl }),
      });
      const next = await loadStatus();
      onFeedback?.({
        success: next.updateAvailable
          ? "Git repository saved. A new release is available."
          : "Git repository saved.",
      });
    } catch (err) {
      onFeedback?.({
        error: err instanceof Error ? err.message : "Failed to save git repository",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return (
      <section className="integrations-section" aria-labelledby="updates-status-heading">
        <p className="integrations-field-hint">Loading release status…</p>
      </section>
    );
  }

  return (
    <section className="integrations-section" aria-labelledby="updates-status-heading">
      <div className="integrations-section-head">
        <h2 id="updates-status-heading">Updates</h2>
        <p>
          Compare your installed build with the latest commit on your configured GitHub repository.
          Release artifacts for the default repo are published to setup-c.co; custom forks need{" "}
          <code>CCO_RELEASES_BASE_URL</code> on the worker.
        </p>
      </div>

      <form className="integrations-fields" onSubmit={(e) => void handleSaveGitRepo(e)}>
        <label className="integrations-field">
          <span className="integrations-field-label">Git repository URL</span>
          <input
            className="integrations-input"
            type="url"
            value={gitRepoUrl}
            onChange={(e) => setGitRepoUrl(e.target.value)}
            placeholder={CCO_DEFAULT_GIT_REPO_URL}
            required
          />
        </label>
        <button
          type="submit"
          className="btn btn-secondary integrations-action-btn"
          disabled={busy !== null}
        >
          {busy === "saveRepo" ? "Saving…" : "Save repository"}
        </button>
      </form>

      <dl className="integrations-fields">
        <div className="integrations-field">
          <span className="integrations-field-label">Platform</span>
          <span>
            {status.platform === "cloudflare"
              ? "BYO Cloudflare"
              : status.platform === "vps"
                ? "VPS"
                : "Unknown"}
          </span>
        </div>
        <div className="integrations-field">
          <span className="integrations-field-label">Installed version</span>
          <span>{shortenSha(status.currentVersion)}</span>
        </div>
        <div className="integrations-field">
          <span className="integrations-field-label">Latest on main</span>
          <span>{shortenSha(status.latestVersion)}</span>
        </div>
        <div className="integrations-field">
          <span className="integrations-field-label">Last checked</span>
          <span>{formatWhen(status.lastUpdateCheckAt)}</span>
        </div>
        {status.latestPublishedAt && (
          <div className="integrations-field">
            <span className="integrations-field-label">Latest published</span>
            <span>{formatWhen(status.latestPublishedAt)}</span>
          </div>
        )}
        {status.releasesBaseUrl && (
          <div className="integrations-field">
            <span className="integrations-field-label">Artifacts base</span>
            <span>
              <a href={status.releasesBaseUrl} target="_blank" rel="noreferrer">
                {status.releasesBaseUrl}
              </a>
            </span>
          </div>
        )}
      </dl>

      {status.lastApplyError && (
        <p className="integrations-feedback integrations-feedback--error" role="alert">
          Last apply failed: {status.lastApplyError}
        </p>
      )}

      <div className="integrations-section-top">
        <button
          type="button"
          className="btn btn-secondary integrations-action-btn"
          disabled={busy !== null}
          onClick={() => void handleCheck()}
        >
          {busy === "check" ? "Checking…" : "Check for updates"}
        </button>
        <button
          type="button"
          className="btn btn-primary integrations-action-btn"
          disabled={busy !== null || !status.canApply}
          onClick={() => void handleApply()}
        >
          {busy === "apply" ? "Applying…" : "Apply update"}
        </button>
      </div>

      {!status.canApply && status.applyBlockedReason && (
        <p className="integrations-field-hint">{status.applyBlockedReason}</p>
      )}

      {status.platform === "cloudflare" && (
        <label className="integrations-toggle">
          <input
            type="checkbox"
            checked={status.autoUpdateEnabled}
            disabled={busy !== null}
            onChange={(event) => void handleToggleAutoUpdate(event.target.checked)}
          />
          <span className="integrations-toggle-label">
            Automatically install new releases (checked every 6 hours). Default is off.
          </span>
        </label>
      )}

      {status.platform === "vps" && (
        <p className="integrations-field-hint">
          VPS production updates use <code>cd ~/cco && ./deploy/update.sh</code> on the server.
        </p>
      )}
    </section>
  );
}
