"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/PageStates";
import { apiFetch } from "@/lib/api";
import { clearDeployWait, markDeployWait } from "@/lib/app-update";

type UpdatesStatus = {
  platform: "cloudflare" | "vps" | "unknown";
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  autoUpdateEnabled: boolean;
  lastUpdateCheckAt: string | null;
  latestPublishedAt: string | null;
  releasesBaseUrl: string | null;
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

export default function UpdatesSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<UpdatesStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | "toggle" | null>(null);

  const loadStatus = useCallback(async () => {
    const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates");
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadStatus();
      } catch (err) {
        const text = err instanceof Error ? err.message : "Failed to load updates";
        if (text.includes("don't have access")) {
          router.replace("/groups");
          return;
        }
        if (text.includes("not configured") || text.includes("(409)")) {
          router.replace("/setup");
          return;
        }
        setError(text);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStatus, router]);

  async function handleCheck() {
    setBusy("check");
    setError(null);
    setSuccess(null);
    try {
      const next = await apiFetch<UpdatesStatus>("/api/v1/settings/updates/check", {
        method: "POST",
      });
      setStatus(next);
      setSuccess(
        next.updateAvailable
          ? "A new release is available."
          : "You're on the latest release.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!status?.canApply) return;
    setBusy("apply");
    setError(null);
    setSuccess(null);
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
      setSuccess(
        result.accepted
          ? `Update started (${version}). Workers are redeploying.${refreshNote}`
          : `Update applied (${version}). Workers are redeploying.${refreshNote}`,
      );
    } catch (err) {
      clearDeployWait();
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAutoUpdate(enabled: boolean) {
    setBusy("toggle");
    setError(null);
    setSuccess(null);
    try {
      const next = await apiFetch<UpdatesStatus & { ok: boolean }>("/api/v1/settings/updates", {
        method: "PATCH",
        body: JSON.stringify({ autoUpdateEnabled: enabled }),
      });
      setStatus(next);
      setSuccess(enabled ? "Automatic updates enabled." : "Automatic updates disabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setting");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <LoadingState variant="page" label="Loading updates" />;
  }

  return (
    <div className="page page-narrow settings-page integrations-settings">
      <header className="integrations-settings-header">
        <Link href="/groups" className="back-link">
          ← Back to chats
        </Link>
        <h1>Updates</h1>
        <p>
          Check for new CCO releases at{" "}
          <a href="https://setup-c.co/releases" target="_blank" rel="noreferrer">
            setup-c.co/releases
          </a>
          . BYO Cloudflare sites redeploy release artifacts — never git pull.
        </p>
        <p className="integrations-field-hint">
          <Link href="/settings/integrations">Integrations settings</Link>
        </p>
      </header>

      {error && <p className="integrations-feedback integrations-feedback--error">{error}</p>}
      {success && <p className="integrations-feedback integrations-feedback--success">{success}</p>}

      {status && (
        <section className="integrations-section" aria-labelledby="updates-status-heading">
          <div className="integrations-section-head">
            <h2 id="updates-status-heading">Release status</h2>
            <p>Compare your installed build with the latest published release.</p>
          </div>

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
              <span className="integrations-field-label">Latest release</span>
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
          </dl>

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
      )}
    </div>
  );
}
