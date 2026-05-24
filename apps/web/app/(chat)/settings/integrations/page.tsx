"use client";

import { useEffect, useState } from "react";
import { SECRET_MASK_LINE } from "@/lib/secret-field-mask";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  children,
}: {
  id: string;
  heading: string;
  description?: React.ReactNode;
  badge?: string | null;
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
            <span className="integrations-badge integrations-badge--success">{badge}</span>
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

function formatPcoLastSynced(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function CloudflareSection({
  name,
  configured,
  fromEnv,
  tokenConfigured,
  accountId,
  appId,
  presetsConfigured,
  onStatusChange,
}: {
  name: string;
  configured: boolean;
  fromEnv: boolean;
  tokenConfigured: boolean;
  accountId: string;
  appId: string;
  presetsConfigured: boolean;
  onStatusChange: (status: Pick<
    IntegrationsSettings,
    | "realtimeKitConfigured"
    | "realtimeKitFromEnv"
    | "cloudflareApiTokenConfigured"
    | "realtimeKitAccountId"
    | "realtimeKitAppId"
    | "realtimeKitTokenConfigured"
    | "realtimeKitPresetsConfigured"
  >) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");

  type CloudflareStatus = Pick<
    IntegrationsSettings,
    | "realtimeKitConfigured"
    | "realtimeKitFromEnv"
    | "cloudflareApiTokenConfigured"
    | "realtimeKitAccountId"
    | "realtimeKitAppId"
    | "realtimeKitTokenConfigured"
    | "realtimeKitPresetsConfigured"
  >;

  async function saveApiToken() {
    const token = cloudflareApiToken.trim();
    if (!token) {
      setError("Paste a Cloudflare API token to save.");
      return;
    }

    setTokenBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<CloudflareStatus & { ok: boolean }>(
        "/api/v1/settings/integrations/cloudflare",
        {
          method: "POST",
          body: JSON.stringify({ cloudflareApiToken: token }),
        },
      );
      onStatusChange(updated);
      setCloudflareApiToken("");
      setSuccess("Cloudflare API token saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Cloudflare token");
    } finally {
      setTokenBusy(false);
    }
  }

  async function handleCallsToggle(enabled: boolean) {
    if (busy) return;

    if (enabled && !tokenConfigured && !fromEnv) {
      setError("Save a Cloudflare API token before enabling calls.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<CloudflareStatus & { ok: boolean }>(
        "/api/v1/settings/integrations/realtimekit",
        {
          method: "POST",
          body: JSON.stringify({ enabled }),
        },
      );
      onStatusChange(updated);
      setSuccess(
        enabled
          ? updated.realtimeKitPresetsConfigured
            ? "Audio & video calls enabled."
            : "Calls enabled. Create host, group_call_participant, and guest presets in RealtimeKit if needed."
          : "Audio & video calls disabled. API token kept for other Cloudflare features.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloudflare setup failed");
    } finally {
      setBusy(false);
    }
  }

  const toggleChecked = configured || fromEnv;
  const toggleDisabled = busy || fromEnv;
  const sectionBusy = busy || tokenBusy;

  return (
    <section className="integrations-section" aria-labelledby="cloudflare-heading">
      <div className="integrations-section-top">
        <div className="integrations-section-head">
          <h2 id="cloudflare-heading">Cloudflare</h2>
          <p>
            Store an API token for Cloudflare integrations. RealtimeKit powers group calls without
            opening ports — free tier includes 1,000 GB/month egress, then $0.05/GB.{" "}
            <a
              href="https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"
              target="_blank"
              rel="noreferrer"
            >
              Create API token
            </a>
          </p>
        </div>
        {configured ? (
          <div className="integrations-section-badges">
            <span className="integrations-badge integrations-badge--success">Calls enabled</span>
          </div>
        ) : tokenConfigured || fromEnv ? (
          <div className="integrations-section-badges">
            <span className="integrations-badge integrations-badge--success">Configured</span>
          </div>
        ) : null}
      </div>

      {!fromEnv ? (
        <div className="integrations-fields">
          <SecretInput
            label="Cloudflare API token"
            configured={tokenConfigured}
            value={cloudflareApiToken}
            onChange={setCloudflareApiToken}
            placeholder="Paste API token"
          />
          <button
            type="button"
            className="btn btn-secondary integrations-action-btn"
            disabled={sectionBusy || !cloudflareApiToken.trim()}
            onClick={() => void saveApiToken()}
          >
            {tokenBusy ? "Saving…" : "Save token"}
          </button>
          {tokenConfigured && accountId ? (
            <p className="integrations-field-hint">
              Account <code>{accountId}</code>
            </p>
          ) : (
            <p className="integrations-field-hint">
              Saved encrypted. Use for RealtimeKit calls and future Cloudflare features.
            </p>
          )}
        </div>
      ) : (
        <p className="integrations-field-hint">
          Configured via server environment. Token and call settings are managed outside this page.
        </p>
      )}

      <label className="integrations-toggle channel-settings-toggle">
        <span className="integrations-toggle-label">Audio &amp; video calls</span>
        <input
          type="checkbox"
          role="switch"
          checked={toggleChecked}
          disabled={toggleDisabled}
          aria-label="Enable audio and video calls"
          onChange={(e) => void handleCallsToggle(e.target.checked)}
        />
        <span className="toggle-switch" aria-hidden="true" />
      </label>

      {configured ? (
        <div className="integrations-field-hint">
          {appId ? (
            <p>
              RealtimeKit app <code>{appId}</code>
            </p>
          ) : null}
          {presetsConfigured ? (
            <p>Preset roles detected from your RealtimeKit app.</p>
          ) : (
            <p>
              Presets not auto-detected for {name || "your church"}. Create <code>host</code>,{" "}
              <code>group_call_participant</code>, and <code>guest</code> in the RealtimeKit
              dashboard, or override via env vars.
            </p>
          )}
        </div>
      ) : tokenConfigured && !fromEnv ? (
        <p className="integrations-field-hint">
          Token is ready. Turn on calls to provision RealtimeKit automatically.
        </p>
      ) : null}

      <Feedback error={error} success={success} />
    </section>
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
  const [realtimeKitAppId, setRealtimeKitAppId] = useState("");
  const [realtimeKitPresetsConfigured, setRealtimeKitPresetsConfigured] = useState(false);
  const [pcoSyncing, setPcoSyncing] = useState(false);
  const [pcoSyncResult, setPcoSyncResult] = useState<string | null>(null);
  const [pcoSyncError, setPcoSyncError] = useState<string | null>(null);
  const [pcoLastSyncedAt, setPcoLastSyncedAt] = useState<string | null>(null);

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
        setRealtimeKitAppId(settings.realtimeKitAppId ?? "");
        setRealtimeKitConfigured(settings.realtimeKitConfigured ?? false);
        setRealtimeKitFromEnv(settings.realtimeKitFromEnv ?? false);
        setCloudflareApiTokenConfigured(
          settings.cloudflareApiTokenConfigured ?? settings.realtimeKitTokenConfigured ?? false,
        );
        setRealtimeKitPresetsConfigured(settings.realtimeKitPresetsConfigured ?? false);
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
    }
  }

  if (loading) return <LoadingState variant="page" label="Loading settings" />;

  const pushStatus =
    vapidKeysConfigured && webPushConfigured
      ? "Enabled for PWA users"
      : vapidKeysConfigured
        ? "Keys ready"
        : null;

  return (
    <div className="page page-narrow settings-page integrations-settings">
      <header className="integrations-settings-header">
        <Link href="/groups" className="back-link">
          ← Back to chats
        </Link>
        <h1>Integrations</h1>
        <p>OAuth, webhooks, and connected services. Saved secrets stay encrypted.</p>
      </header>

      <section className="integrations-section" aria-labelledby="pco-sync-heading">
        <div className="integrations-section-head">
          <h2 id="pco-sync-heading">Planning Center sync</h2>
          <p>Refresh groups, teams, and rosters for your account.</p>
          {pcoLastSyncedAt ? (
            <p className="integrations-field-hint">
              Last synced {formatPcoLastSynced(pcoLastSyncedAt)}
            </p>
          ) : (
            <p className="integrations-field-hint">Not synced yet</p>
          )}
        </div>
        <Feedback error={pcoSyncError} success={pcoSyncResult} />
        <button
          type="button"
          className="btn btn-secondary integrations-action-btn"
          disabled={pcoSyncing}
          onClick={() => void handlePcoSync()}
        >
          {pcoSyncing ? "Syncing…" : "Sync from Planning Center"}
        </button>
      </section>

      <CloudflareSection
        name={name}
        configured={realtimeKitConfigured}
        fromEnv={realtimeKitFromEnv}
        tokenConfigured={cloudflareApiTokenConfigured}
        accountId={realtimeKitAccountId}
        appId={realtimeKitAppId}
        presetsConfigured={realtimeKitPresetsConfigured}
        onStatusChange={(status) => {
          setRealtimeKitConfigured(status.realtimeKitConfigured ?? false);
          setRealtimeKitFromEnv(status.realtimeKitFromEnv ?? false);
          setCloudflareApiTokenConfigured(
            status.cloudflareApiTokenConfigured ?? status.realtimeKitTokenConfigured ?? false,
          );
          setRealtimeKitPresetsConfigured(status.realtimeKitPresetsConfigured ?? false);
          if (status.realtimeKitAccountId) setRealtimeKitAccountId(status.realtimeKitAccountId);
          if (status.realtimeKitAppId) setRealtimeKitAppId(status.realtimeKitAppId);
        }}
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
