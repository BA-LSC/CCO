"use client";

import { useEffect, useState } from "react";
import { SECRET_MASK_LINE } from "@/lib/secret-field-mask";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminUpdatesSection, type UpdatesStatus } from "@/components/AdminUpdatesSection";
import { IntegrationsFeedbackToast } from "@/components/IntegrationsFeedbackToast";
import { LoadingState } from "@/components/PageStates";
import { WebhookSecretsField } from "@/components/WebhookSecretsField";
import { apiFetch } from "@/lib/api";
import type { SetupRedirectUris } from "@/lib/setup";

type IntegrationsSettings = {
  configured: boolean;
  name: string;
  clientId: string;
  clientSecretConfigured: boolean;
  webhookConfigured: boolean;
  webhookSecretCount: number;
  signInRedirectUri: string;
  webhookUrl: string;
  pcoLastSyncedAt?: string | null;
  pcoNightlySyncEnabled?: boolean;
  pcoNightlySyncCron?: string;
  pcoNightlySyncSchedule?: string;
  vapidKeysConfigured: boolean;
  vapidSubjectEmail: string;
  webPushConfigured: boolean;
  giphyApiKeyConfigured: boolean;
  realtimeKitConfigured?: boolean;
  realtimeKitFromEnv?: boolean;
  cloudflareApiTokenConfigured?: boolean;
  cloudflareApiTokenValid?: boolean | null;
  cloudflareApiTokenError?: string | null;
  realtimeKitAccountId?: string;
  realtimeKitAppId?: string;
  realtimeKitTokenConfigured?: boolean;
  realtimeKitPresetsConfigured?: boolean;
  realtimeKitPresetHost?: string;
  realtimeKitPresetMember?: string;
  realtimeKitPresetGuest?: string;
  cloudflarePlatformProvisionedAt?: string | null;
  cloudflarePlatformConfigured?: boolean;
  workerPlacementMode?: "smart" | "region";
  workerPlacementRegion?: string | null;
  workerPlacementRegionOptions?: Array<{ id: string; label: string }>;
  workerPlacementSummary?: string;
  workerPlacementRedeployQueued?: boolean;
  workerPlacementRedeploySkipped?: boolean;
  workerPlacementRedeploySkippedReason?: string;
  workerPlacementLastError?: string | null;
  updates?: UpdatesStatus | null;
};

type PcoSyncResult = {
  synced: boolean;
  pcoLastSyncedAt?: string;
  groups: {
    created: number;
    updated: number;
    total: number;
    rosterSync: { groupsSynced: number; upserted: number };
  };
  teams: {
    created: number;
    removed: number;
    total: number;
    rosterSync: { teamsSynced: number; upserted: number };
  };
};

function SecretInput({
  label,
  configured,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  configured: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const showMask = configured && value === "" && !focused;

  return (
    <label className="integrations-field">
      <span className="integrations-field-label">{label}</span>
      <input
        className="integrations-input"
        value={showMask ? SECRET_MASK_LINE : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        type="password"
        autoComplete="new-password"
        placeholder={showMask ? undefined : placeholder}
      />
    </label>
  );
}

function IntegrationsSection({
  id,
  heading,
  description,
  badge,
  badgeVariant = "success",
  children,
}: {
  id: string;
  heading: string;
  description?: React.ReactNode;
  badge?: string | null;
  badgeVariant?: "success" | "muted";
  children: React.ReactNode;
}) {
  return (
    <section className="integrations-section" aria-labelledby={id}>
      <div className="integrations-section-top">
        <div className="integrations-section-head">
          <h2 id={id}>{heading}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {badge ? (
          <div className="integrations-section-badges">
            <span className={`integrations-badge integrations-badge--${badgeVariant}`}>
              {badge}
            </span>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="integrations-field">
      <span className="integrations-field-label">{label}</span>
      <input
        className="integrations-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </label>
  );
}

function formatPcoSyncBadge(iso: string | null): { label: string; variant: "success" | "muted" } {
  if (!iso) {
    return { label: "Not synced yet", variant: "muted" };
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { label: "Synced recently", variant: "success" };
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return { label: `Synced ${rtf.format(diffMinutes, "minute")}`, variant: "success" };
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return { label: `Synced ${rtf.format(diffHours, "hour")}`, variant: "success" };
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 14) {
    return { label: `Synced ${rtf.format(diffDays, "day")}`, variant: "success" };
  }

  const formatted = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return { label: `Synced ${formatted}`, variant: "success" };
}

function CloudflareSection({
  platformProvisioned,
  configured,
  fromEnv,
  tokenConfigured,
  tokenValid,
  tokenError,
  accountId,
  apiToken,
  onApiTokenChange,
  workerPlacementMode,
  workerPlacementRegion,
  workerPlacementRegionOptions,
  workerPlacementSummary,
  onWorkerPlacementModeChange,
  onWorkerPlacementRegionChange,
}: {
  platformProvisioned: boolean;
  configured: boolean;
  fromEnv: boolean;
  tokenConfigured: boolean;
  tokenValid: boolean | null;
  tokenError: string | null;
  accountId: string;
  apiToken: string;
  onApiTokenChange: (value: string) => void;
  workerPlacementMode: "smart" | "region";
  workerPlacementRegion: string;
  workerPlacementRegionOptions: Array<{ id: string; label: string }>;
  workerPlacementSummary?: string;
  onWorkerPlacementModeChange: (mode: "smart" | "region") => void;
  onWorkerPlacementRegionChange: (region: string) => void;
}) {
  const hasCloudflare =
    platformProvisioned || configured || fromEnv || tokenConfigured;
  if (!hasCloudflare) return null;

  const tokenNeedsRefresh = tokenConfigured && tokenValid === false;
  const connected = (platformProvisioned || tokenConfigured || fromEnv) && !tokenNeedsRefresh;
  const canEditToken = !fromEnv && (platformProvisioned || tokenConfigured || tokenNeedsRefresh);

  const description = tokenNeedsRefresh
    ? (tokenError ??
      "The stored Cloudflare API token is invalid or expired. Paste a new token below and save, then retry Apply update.")
    : platformProvisioned
      ? "Connected during install. Paste a new API token here after rotating credentials or adding permissions (including Secrets Store → Write)."
      : fromEnv
        ? "Configured via server environment. Token and call settings are managed outside this page."
        : "Cloudflare API token is stored encrypted.";

  return (
    <IntegrationsSection
      id="cloudflare-heading"
      heading="Cloudflare"
      description={description}
      badge={
        tokenNeedsRefresh
          ? "Token expired"
          : connected
            ? "Connected"
            : undefined
      }
      badgeVariant={tokenNeedsRefresh ? "muted" : "success"}
    >
      {tokenNeedsRefresh ? (
        <p className="integrations-feedback integrations-feedback--error" role="alert">
          {tokenError ??
            "Cloudflare API token failed verification. Paste a new token and save."}
        </p>
      ) : null}
      {accountId ? (
        <p className="integrations-field-hint">
          Account <code>{accountId}</code>
        </p>
      ) : null}
      {canEditToken ? (
        <div className="integrations-fields">
          <SecretInput
            label="Cloudflare API token"
            configured={tokenConfigured}
            value={apiToken}
            onChange={onApiTokenChange}
            placeholder="Paste new token (Secrets Store → Write required for updates)"
          />
        </div>
      ) : null}
      {platformProvisioned && !fromEnv ? (
        <fieldset className="integrations-fields integrations-placement">
          <legend className="integrations-field-label">Worker region</legend>
          {workerPlacementSummary ? (
            <p className="integrations-field-hint">
              Current: <strong>{workerPlacementSummary}</strong>
            </p>
          ) : null}
          <p className="integrations-field-hint">
            Controls where API and realtime workers run. Automatic uses Smart Placement near your D1
            and storage; fixed region pins workers to a data center (US West recommended for most
            US churches).
          </p>
          <label className="integrations-radio">
            <input
              type="radio"
              name="worker-placement-mode"
              checked={workerPlacementMode === "smart"}
              onChange={() => onWorkerPlacementModeChange("smart")}
            />
            <span>Automatic (recommended)</span>
          </label>
          <label className="integrations-radio">
            <input
              type="radio"
              name="worker-placement-mode"
              checked={workerPlacementMode === "region"}
              onChange={() => onWorkerPlacementModeChange("region")}
            />
            <span>Fixed region</span>
          </label>
          {workerPlacementMode === "region" ? (
            <label className="integrations-field">
              <span className="integrations-field-label">Region</span>
              <select
                className="integrations-input"
                value={workerPlacementRegion}
                onChange={(e) => onWorkerPlacementRegionChange(e.target.value)}
              >
                {workerPlacementRegionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>
      ) : null}
    </IntegrationsSection>
  );
}

export default function IntegrationsSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uris, setUris] = useState<SetupRedirectUris | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [signInRedirectUri, setSignInRedirectUri] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clientSecretConfigured, setClientSecretConfigured] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [webhookSecretCount, setWebhookSecretCount] = useState(0);
  const [vapidSubjectEmail, setVapidSubjectEmail] = useState("");
  const [vapidKeysConfigured, setVapidKeysConfigured] = useState(false);
  const [webPushConfigured, setWebPushConfigured] = useState(false);
  const [giphyApiKey, setGiphyApiKey] = useState("");
  const [giphyApiKeyConfigured, setGiphyApiKeyConfigured] = useState(false);
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");
  const [realtimeKitConfigured, setRealtimeKitConfigured] = useState(false);
  const [realtimeKitFromEnv, setRealtimeKitFromEnv] = useState(false);
  const [cloudflareApiTokenConfigured, setCloudflareApiTokenConfigured] = useState(false);
  const [cloudflareApiTokenValid, setCloudflareApiTokenValid] = useState<boolean | null>(null);
  const [cloudflareApiTokenError, setCloudflareApiTokenError] = useState<string | null>(null);
  const [realtimeKitAccountId, setRealtimeKitAccountId] = useState("");
  const [cloudflarePlatformProvisionedAt, setCloudflarePlatformProvisionedAt] = useState<
    string | null
  >(null);
  const [cloudflarePlatformProvisioned, setCloudflarePlatformProvisioned] = useState(false);
  const [workerPlacementMode, setWorkerPlacementMode] = useState<"smart" | "region">("smart");
  const [workerPlacementRegion, setWorkerPlacementRegion] = useState("aws:us-west-2");
  const [workerPlacementSummary, setWorkerPlacementSummary] = useState<string | undefined>();
  const [workerPlacementRegionOptions, setWorkerPlacementRegionOptions] = useState<
    Array<{ id: string; label: string }>
  >([{ id: "aws:us-west-2", label: "US West — AWS Oregon (recommended)" }]);
  const [pcoSyncing, setPcoSyncing] = useState(false);
  const [pcoSyncBusy, setPcoSyncBusy] = useState<"sync" | "toggle" | null>(null);
  const [pcoSyncResult, setPcoSyncResult] = useState<string | null>(null);
  const [pcoSyncError, setPcoSyncError] = useState<string | null>(null);
  const [pcoLastSyncedAt, setPcoLastSyncedAt] = useState<string | null>(null);
  const [pcoNightlySyncEnabled, setPcoNightlySyncEnabled] = useState(true);
  const [updatesStatus, setUpdatesStatus] = useState<UpdatesStatus | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [settings, redirectUris] = await Promise.all([
          apiFetch<IntegrationsSettings>("/api/v1/settings/integrations"),
          fetch("/api/v1/setup/redirect-uris").then((r) => r.json() as Promise<SetupRedirectUris>),
        ]);
        setUpdatesStatus(settings.updates ?? null);

        setName(settings.name);
        setClientId(settings.clientId);
        setPcoLastSyncedAt(settings.pcoLastSyncedAt ?? null);
        setPcoNightlySyncEnabled(settings.pcoNightlySyncEnabled ?? true);
        setSignInRedirectUri(settings.signInRedirectUri);
        setWebhookUrl(settings.webhookUrl);
        setClientSecretConfigured(settings.clientSecretConfigured);
        setWebhookConfigured(settings.webhookConfigured);
        setWebhookSecretCount(settings.webhookSecretCount ?? 0);
        setVapidSubjectEmail(settings.vapidSubjectEmail ?? "");
        setVapidKeysConfigured(settings.vapidKeysConfigured ?? false);
        setWebPushConfigured(settings.webPushConfigured ?? false);
        setGiphyApiKeyConfigured(settings.giphyApiKeyConfigured ?? false);
        setRealtimeKitAccountId(settings.realtimeKitAccountId ?? "");
        setRealtimeKitConfigured(settings.realtimeKitConfigured ?? false);
        setRealtimeKitFromEnv(settings.realtimeKitFromEnv ?? false);
        setCloudflareApiTokenConfigured(
          settings.cloudflareApiTokenConfigured ?? settings.realtimeKitTokenConfigured ?? false,
        );
        setCloudflareApiTokenValid(settings.cloudflareApiTokenValid ?? null);
        setCloudflareApiTokenError(settings.cloudflareApiTokenError ?? null);
        setCloudflarePlatformProvisionedAt(settings.cloudflarePlatformProvisionedAt ?? null);
        setCloudflarePlatformProvisioned(
          Boolean(settings.cloudflarePlatformProvisionedAt) ||
            Boolean(settings.cloudflarePlatformConfigured),
        );
        setWorkerPlacementMode(settings.workerPlacementMode ?? "smart");
        setWorkerPlacementRegion(settings.workerPlacementRegion ?? "aws:us-west-2");
        setWorkerPlacementSummary(settings.workerPlacementSummary);
        if (settings.workerPlacementRegionOptions?.length) {
          setWorkerPlacementRegionOptions(settings.workerPlacementRegionOptions);
        }
        if (settings.workerPlacementLastError) {
          setError(settings.workerPlacementLastError);
        }
        setUris(redirectUris);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load settings";
        if (message.includes("don't have access")) {
          router.replace("/groups");
          return;
        }
        if (message.includes("not configured") || message.includes("(409)")) {
          router.replace("/setup");
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const trimmedCloudflareToken = cloudflareApiToken.trim();

    const payload: Record<string, string> & {
      workerPlacementMode?: "smart" | "region";
      workerPlacementRegion?: string;
    } = {
      name,
      clientId,
      signInRedirectUri,
      webhookUrl,
    };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (webhookSecret.trim()) payload.webhookSecret = webhookSecret;
    if (vapidSubjectEmail.trim()) payload.vapidSubjectEmail = vapidSubjectEmail.trim();
    if (giphyApiKey.trim()) payload.giphyApiKey = giphyApiKey.trim();
    if (cloudflarePlatformProvisionedAt) {
      payload.workerPlacementMode = workerPlacementMode;
      if (workerPlacementMode === "region") {
        payload.workerPlacementRegion = workerPlacementRegion;
      }
    }

    try {
      if (trimmedCloudflareToken) {
        const cloudflareUpdated = await apiFetch<
          IntegrationsSettings & { ok: boolean }
        >("/api/v1/settings/integrations/cloudflare", {
          method: "POST",
          body: JSON.stringify({ cloudflareApiToken: trimmedCloudflareToken }),
        });
        setCloudflareApiToken("");
        setCloudflareApiTokenConfigured(
          cloudflareUpdated.cloudflareApiTokenConfigured ??
            cloudflareUpdated.realtimeKitTokenConfigured ??
            true,
        );
        if (cloudflareUpdated.realtimeKitAccountId) {
          setRealtimeKitAccountId(cloudflareUpdated.realtimeKitAccountId);
        }
        setRealtimeKitConfigured(cloudflareUpdated.realtimeKitConfigured ?? realtimeKitConfigured);
        setCloudflarePlatformProvisionedAt(
          cloudflareUpdated.cloudflarePlatformProvisionedAt ?? cloudflarePlatformProvisionedAt,
        );
        setCloudflarePlatformProvisioned(
          Boolean(cloudflareUpdated.cloudflarePlatformProvisionedAt) ||
            Boolean(cloudflareUpdated.cloudflarePlatformConfigured) ||
            cloudflarePlatformProvisioned,
        );
        setCloudflareApiTokenValid(cloudflareUpdated.cloudflareApiTokenValid ?? true);
        setCloudflareApiTokenError(cloudflareUpdated.cloudflareApiTokenError ?? null);
      }

      const updated = await apiFetch<IntegrationsSettings & { ok: boolean }>(
        "/api/v1/settings/integrations",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      setName(updated.name);
      setClientId(updated.clientId);
      if (updated.signInRedirectUri) setSignInRedirectUri(updated.signInRedirectUri);
      if (updated.webhookUrl) setWebhookUrl(updated.webhookUrl);
      setClientSecretConfigured(updated.clientSecretConfigured);
      setWebhookConfigured(updated.webhookConfigured);
      setWebhookSecretCount(updated.webhookSecretCount ?? 0);
      setVapidSubjectEmail(updated.vapidSubjectEmail ?? "");
      setVapidKeysConfigured(updated.vapidKeysConfigured ?? false);
      setWebPushConfigured(updated.webPushConfigured ?? false);
      setGiphyApiKeyConfigured(updated.giphyApiKeyConfigured ?? false);
      setClientSecret("");
      setWebhookSecret("");
      setGiphyApiKey("");
      if (updated.workerPlacementMode) {
        setWorkerPlacementMode(updated.workerPlacementMode);
      }
      if (updated.workerPlacementRegion) {
        setWorkerPlacementRegion(updated.workerPlacementRegion);
      }
      if (updated.workerPlacementRegionOptions?.length) {
        setWorkerPlacementRegionOptions(updated.workerPlacementRegionOptions);
      }
      if (updated.workerPlacementSummary) {
        setWorkerPlacementSummary(updated.workerPlacementSummary);
      }

      let successMessage = "Settings saved.";
      if (updated.workerPlacementRedeployQueued) {
        successMessage =
          "Settings saved. Worker redeploy started in the background — this may take a minute.";
      } else if (
        updated.workerPlacementRedeploySkipped &&
        updated.workerPlacementRedeploySkippedReason
      ) {
        successMessage = updated.workerPlacementRedeploySkippedReason;
      }
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePcoSync() {
    setPcoSyncBusy("sync");
    setPcoSyncing(true);
    setPcoSyncError(null);
    setPcoSyncResult(null);

    try {
      const result = await apiFetch<PcoSyncResult>("/api/v1/settings/integrations/pco-sync", {
        method: "POST",
      });
      const { groups, teams } = result;
      if (result.pcoLastSyncedAt) setPcoLastSyncedAt(result.pcoLastSyncedAt);
      setPcoSyncResult(
        `Synced ${groups.total} groups and ${teams.total} teams. Refreshed ${groups.rosterSync.groupsSynced} group rosters and ${teams.rosterSync.teamsSynced} team rosters.`,
      );
    } catch (err) {
      setPcoSyncError(err instanceof Error ? err.message : "Planning Center sync failed");
    } finally {
      setPcoSyncing(false);
      setPcoSyncBusy(null);
    }
  }

  async function handleTogglePcoNightlySync(enabled: boolean) {
    setPcoSyncBusy("toggle");
    setPcoSyncError(null);
    setPcoSyncResult(null);

    try {
      const updated = await apiFetch<IntegrationsSettings & { ok: boolean }>(
        "/api/v1/settings/integrations",
        {
          method: "PATCH",
          body: JSON.stringify({ pcoNightlySyncEnabled: enabled }),
        },
      );
      setPcoNightlySyncEnabled(updated.pcoNightlySyncEnabled ?? enabled);
      if (updated.pcoLastSyncedAt !== undefined) {
        setPcoLastSyncedAt(updated.pcoLastSyncedAt ?? null);
      }
      setPcoSyncResult(
        enabled ? "Nightly Planning Center sync enabled." : "Nightly Planning Center sync disabled.",
      );
    } catch (err) {
      setPcoSyncError(err instanceof Error ? err.message : "Failed to save sync setting");
    } finally {
      setPcoSyncBusy(null);
    }
  }

  if (loading) return <LoadingState variant="page" label="Loading settings" />;

  const pushStatus =
    vapidKeysConfigured && webPushConfigured
      ? "Enabled for PWA users"
      : vapidKeysConfigured
        ? "Keys ready"
        : null;

  const pcoSyncBadge = formatPcoSyncBadge(pcoLastSyncedAt);

  return (
    <div className="page page-narrow settings-page integrations-settings">
      <header className="integrations-settings-header">
        <Link href="/groups" className="back-link">
          ← Back to chats
        </Link>
        <h1>Admin Settings</h1>
        <p>Integrations, Cloudflare, release updates, and org configuration. Saved secrets stay encrypted.</p>
      </header>

      <AdminUpdatesSection
        initialStatus={updatesStatus}
        applyCloudflareApiToken={cloudflareApiToken.trim() || undefined}
      />

      <IntegrationsSection
        id="pco-sync-heading"
        heading="Planning Center sync"
        badge={pcoSyncBadge.label}
        badgeVariant={pcoSyncBadge.variant}
      >
        <IntegrationsFeedbackToast
          error={pcoSyncError}
          success={pcoSyncResult}
          onDismiss={() => {
            setPcoSyncError(null);
            setPcoSyncResult(null);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary integrations-action-btn"
          disabled={pcoSyncBusy !== null}
          onClick={() => void handlePcoSync()}
        >
          {pcoSyncing ? "Syncing…" : "Sync Now"}
        </button>
        <label className="integrations-toggle">
          <span className="integrations-toggle-label">Nightly sync</span>
          <input
            type="checkbox"
            role="switch"
            checked={pcoNightlySyncEnabled}
            disabled={pcoSyncBusy !== null}
            onChange={(event) => void handleTogglePcoNightlySync(event.target.checked)}
            aria-label="Nightly sync"
          />
          <span className="toggle-switch" aria-hidden="true" />
        </label>
      </IntegrationsSection>

      <form className="integrations-form" onSubmit={(e) => void handleSubmit(e)}>
        <CloudflareSection
          platformProvisioned={Boolean(cloudflarePlatformProvisionedAt)}
          configured={realtimeKitConfigured}
          fromEnv={realtimeKitFromEnv}
          tokenConfigured={cloudflareApiTokenConfigured}
          tokenValid={cloudflareApiTokenValid}
          tokenError={cloudflareApiTokenError}
          accountId={realtimeKitAccountId}
          apiToken={cloudflareApiToken}
          onApiTokenChange={setCloudflareApiToken}
          workerPlacementMode={workerPlacementMode}
          workerPlacementRegion={workerPlacementRegion}
          workerPlacementRegionOptions={workerPlacementRegionOptions}
          workerPlacementSummary={workerPlacementSummary}
          onWorkerPlacementModeChange={setWorkerPlacementMode}
          onWorkerPlacementRegionChange={setWorkerPlacementRegion}
        />

        <IntegrationsSection
          id="pco-oauth-heading"
          heading="Planning Center OAuth"
          badge={clientSecretConfigured ? "Configured" : null}
        >
          <div className="integrations-fields">
            <TextInput label="Church name" value={name} onChange={setName} required placeholder="My Church" />
            <TextInput
              label="Client ID"
              value={clientId}
              onChange={setClientId}
              required
              autoComplete="off"
            />
            <SecretInput
              label="Client secret"
              configured={clientSecretConfigured}
              value={clientSecret}
              onChange={setClientSecret}
              placeholder="Paste new secret"
            />
          </div>
        </IntegrationsSection>

        <IntegrationsSection
          id="pco-urls-heading"
          heading="Callback URLs"
          description="Use these in your Planning Center OAuth app and webhook subscriptions."
        >
          <div className="integrations-fields">
            <TextInput
              label="OAuth redirect URI"
              value={signInRedirectUri}
              onChange={setSignInRedirectUri}
              type="url"
              required
              autoComplete="off"
              placeholder={
                uris?.defaultSignInRedirectUri ?? "https://chat.example.com/api/auth/pco/callback"
              }
            />
            <TextInput
              label="Webhook endpoint URL"
              value={webhookUrl}
              onChange={setWebhookUrl}
              type="url"
              required
              autoComplete="off"
              placeholder={uris?.defaultWebhookUrl ?? "https://api.example.com/webhooks/pco"}
            />
          </div>
        </IntegrationsSection>

        <IntegrationsSection
          id="pco-webhooks-heading"
          heading="Webhooks"
          badge={
            webhookConfigured && webhookSecretCount > 0 ? "Configured" : null
          }
        >
          <WebhookSecretsField
            value={webhookSecret}
            onChange={setWebhookSecret}
            configured={webhookConfigured}
            secretCount={webhookSecretCount}
            helpText="Saving replaces all stored webhook secrets."
          />
        </IntegrationsSection>

        <IntegrationsSection
          id="push-heading"
          heading="Push notifications"
          description="VAPID keys are generated automatically. Add a contact email for installed PWA users."
          badge={pushStatus}
        >
          <div className="integrations-fields">
            <TextInput
              label="VAPID contact email"
              value={vapidSubjectEmail}
              onChange={setVapidSubjectEmail}
              type="email"
              autoComplete="email"
              placeholder="notifications@yourchurch.org"
            />
          </div>
        </IntegrationsSection>

        <IntegrationsSection
          id="giphy-heading"
          heading="Giphy"
          description={
            <>
              Optional API key for GIF search in chat.{" "}
              <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">
                Get a key
              </a>
            </>
          }
          badge={giphyApiKeyConfigured ? "Configured" : null}
        >
          <SecretInput
            label="API key"
            configured={giphyApiKeyConfigured}
            value={giphyApiKey}
            onChange={setGiphyApiKey}
            placeholder="Paste new key"
          />
        </IntegrationsSection>

        <footer className="integrations-form-footer">
          <IntegrationsFeedbackToast
            error={error}
            success={success}
            onDismiss={() => {
              setError(null);
              setSuccess(null);
            }}
          />
          <button type="submit" className="btn btn-primary integrations-save-btn" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
