"use client";

import { useEffect, useState } from "react";
import { SECRET_MASK_LINE } from "@/lib/secret-field-mask";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminUpdatesSection } from "@/components/AdminUpdatesSection";
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
  realtimeKitAccountId?: string;
  realtimeKitAppId?: string;
  realtimeKitTokenConfigured?: boolean;
  realtimeKitPresetsConfigured?: boolean;
  realtimeKitPresetHost?: string;
  realtimeKitPresetMember?: string;
  realtimeKitPresetGuest?: string;
  cloudflarePlatformProvisionedAt?: string | null;
  cloudflarePlatformConfigured?: boolean;
  gitRepoUrl?: string;
  defaultGitRepoUrl?: string;
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

function Feedback({ error, success }: { error?: string | null; success?: string | null }) {
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
  accountId,
}: {
  platformProvisioned: boolean;
  configured: boolean;
  fromEnv: boolean;
  tokenConfigured: boolean;
  accountId: string;
}) {
  const hasCloudflare =
    platformProvisioned || configured || fromEnv || tokenConfigured;
  if (!hasCloudflare) return null;

  const connected = platformProvisioned || tokenConfigured || fromEnv;
  const callsEnabled = configured || fromEnv;

  const description = platformProvisioned
    ? "Connected during install. Audio and video calls use RealtimeKit, included with your Cloudflare deployment."
    : fromEnv
      ? "Configured via server environment. Token and call settings are managed outside this page."
      : "Cloudflare API token is stored encrypted for updates and RealtimeKit calls.";

  return (
    <IntegrationsSection
      id="cloudflare-heading"
      heading="Cloudflare"
      description={description}
      badge={connected ? "Connected" : undefined}
    >
      {accountId ? (
        <p className="integrations-field-hint">
          Account <code>{accountId}</code>
        </p>
      ) : null}
      {callsEnabled ? (
        <p className="integrations-field-hint">Audio &amp; video calls are enabled.</p>
      ) : null}
    </IntegrationsSection>
  );
}

export default function IntegrationsSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
  const [realtimeKitConfigured, setRealtimeKitConfigured] = useState(false);
  const [realtimeKitFromEnv, setRealtimeKitFromEnv] = useState(false);
  const [cloudflareApiTokenConfigured, setCloudflareApiTokenConfigured] = useState(false);
  const [realtimeKitAccountId, setRealtimeKitAccountId] = useState("");
  const [cloudflarePlatformProvisioned, setCloudflarePlatformProvisioned] = useState(false);
  const [pcoSyncing, setPcoSyncing] = useState(false);
  const [pcoSyncBusy, setPcoSyncBusy] = useState<"sync" | "toggle" | null>(null);
  const [pcoSyncResult, setPcoSyncResult] = useState<string | null>(null);
  const [pcoSyncError, setPcoSyncError] = useState<string | null>(null);
  const [pcoLastSyncedAt, setPcoLastSyncedAt] = useState<string | null>(null);
  const [pcoNightlySyncEnabled, setPcoNightlySyncEnabled] = useState(true);
  const [pcoNightlySyncSchedule, setPcoNightlySyncSchedule] = useState("Nightly at 3:00 AM UTC");
  const [gitRepoUrl, setGitRepoUrl] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [settings, redirectUris] = await Promise.all([
          apiFetch<IntegrationsSettings>("/api/v1/settings/integrations"),
          fetch("/api/v1/setup/redirect-uris").then((r) => r.json() as Promise<SetupRedirectUris>),
        ]);

        setName(settings.name);
        setClientId(settings.clientId);
        setPcoLastSyncedAt(settings.pcoLastSyncedAt ?? null);
        setPcoNightlySyncEnabled(settings.pcoNightlySyncEnabled ?? true);
        setPcoNightlySyncSchedule(settings.pcoNightlySyncSchedule ?? "Nightly at 3:00 AM UTC");
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
        setCloudflarePlatformProvisioned(
          Boolean(settings.cloudflarePlatformProvisionedAt) ||
            Boolean(settings.cloudflarePlatformConfigured),
        );
        setGitRepoUrl(settings.gitRepoUrl ?? settings.defaultGitRepoUrl ?? "");
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
    setSaved(false);

    const payload: Record<string, string> = {
      name,
      clientId,
      signInRedirectUri,
      webhookUrl,
    };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (webhookSecret.trim()) payload.webhookSecret = webhookSecret;
    if (vapidSubjectEmail.trim()) payload.vapidSubjectEmail = vapidSubjectEmail.trim();
    if (giphyApiKey.trim()) payload.giphyApiKey = giphyApiKey.trim();

    try {
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
      setSaved(true);
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
      if (updated.pcoNightlySyncSchedule) {
        setPcoNightlySyncSchedule(updated.pcoNightlySyncSchedule);
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
        initialGitRepoUrl={gitRepoUrl}
        onFeedback={({ error: updateError, success: updateSuccess }) => {
          if (updateError) {
            setError(updateError);
            setSaved(false);
          }
          if (updateSuccess) {
            setError(null);
            setSaved(false);
            setPcoSyncResult(updateSuccess);
          }
        }}
      />

      <IntegrationsSection
        id="pco-sync-heading"
        heading="Planning Center sync"
        description="Refresh groups, teams, and rosters for your account."
        badge={pcoSyncBadge.label}
        badgeVariant={pcoSyncBadge.variant}
      >
        <Feedback error={pcoSyncError} success={pcoSyncResult} />
        <button
          type="button"
          className="btn btn-secondary integrations-action-btn"
          disabled={pcoSyncBusy !== null}
          onClick={() => void handlePcoSync()}
        >
          {pcoSyncing ? "Syncing…" : "Sync from Planning Center"}
        </button>
        <p className="integrations-field-hint">{pcoNightlySyncSchedule}</p>
        <label className="integrations-toggle">
          <input
            type="checkbox"
            checked={pcoNightlySyncEnabled}
            disabled={pcoSyncBusy !== null}
            onChange={(event) => void handleTogglePcoNightlySync(event.target.checked)}
          />
          <span className="integrations-toggle-label">
            Run automatic nightly sync for all linked Planning Center accounts.
          </span>
        </label>
      </IntegrationsSection>

      <CloudflareSection
        platformProvisioned={cloudflarePlatformProvisioned}
        configured={realtimeKitConfigured}
        fromEnv={realtimeKitFromEnv}
        tokenConfigured={cloudflareApiTokenConfigured}
        accountId={realtimeKitAccountId}
      />

      <form className="integrations-form" onSubmit={(e) => void handleSubmit(e)}>
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
            webhookConfigured && webhookSecretCount > 0
              ? `${webhookSecretCount} configured`
              : null
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
          <Feedback error={error} success={saved ? "Settings saved." : null} />
          <button type="submit" className="btn btn-primary integrations-save-btn" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
