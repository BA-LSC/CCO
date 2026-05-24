"use client";

import { useEffect, useRef, useState } from "react";
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
  vapidKeysConfigured: boolean;
  vapidSubjectEmail: string;
  webPushConfigured: boolean;
  giphyApiKeyConfigured: boolean;
  realtimeKitConfigured?: boolean;
  realtimeKitFromEnv?: boolean;
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
  const keepCurrent = configured && value === "" && !focused;

  return (
    <label className="integrations-field">
      <span className="integrations-field-label">{label}</span>
      <input
        className="integrations-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        type="password"
        autoComplete="new-password"
        placeholder={keepCurrent ? "Leave blank to keep current" : placeholder}
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

function CloudflareCallsSection({
  name,
  configured,
  fromEnv,
  accountId,
  appId,
  presetsConfigured,
  onStatusChange,
}: {
  name: string;
  configured: boolean;
  fromEnv: boolean;
  accountId: string;
  appId: string;
  presetsConfigured: boolean;
  onStatusChange: (status: Pick<
    IntegrationsSettings,
    | "realtimeKitConfigured"
    | "realtimeKitFromEnv"
    | "realtimeKitAccountId"
    | "realtimeKitAppId"
    | "realtimeKitTokenConfigured"
    | "realtimeKitPresetsConfigured"
  >) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [awaitingToken, setAwaitingToken] = useState(false);
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");
  const provisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function applyCallsSetting(enabled: boolean, token?: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<
        Pick<
          IntegrationsSettings,
          | "realtimeKitConfigured"
          | "realtimeKitFromEnv"
          | "realtimeKitAccountId"
          | "realtimeKitAppId"
          | "realtimeKitTokenConfigured"
          | "realtimeKitPresetsConfigured"
        > & { ok: boolean }
      >("/api/v1/settings/integrations/realtimekit", {
        method: "POST",
        body: JSON.stringify({
          enabled,
          ...(token?.trim() ? { cloudflareApiToken: token.trim() } : {}),
        }),
      });
      onStatusChange(updated);
      setCloudflareApiToken("");
      setAwaitingToken(false);
      setSuccess(
        enabled
          ? updated.realtimeKitPresetsConfigured
            ? "Audio & video calls enabled."
            : "Calls enabled. Create host, group_call_participant, and guest presets in RealtimeKit if needed."
          : "Audio & video calls disabled.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloudflare setup failed");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    if (busy) return;

    if (!enabled) {
      await applyCallsSetting(false);
      return;
    }

    if (configured || fromEnv) {
      await applyCallsSetting(true);
      return;
    }

    setAwaitingToken(true);
    setError(null);
    setSuccess(null);
  }

  useEffect(() => {
    if (!awaitingToken || busy) return;
    const token = cloudflareApiToken.trim();
    if (token.length < 20) return;

    if (provisionTimerRef.current) clearTimeout(provisionTimerRef.current);
    provisionTimerRef.current = setTimeout(() => {
      void applyCallsSetting(true, token).catch(() => {
        /* error state handled in applyCallsSetting */
      });
    }, 600);

    return () => {
      if (provisionTimerRef.current) clearTimeout(provisionTimerRef.current);
    };
  }, [awaitingToken, busy, cloudflareApiToken]);

  const toggleChecked = configured || fromEnv;
  const toggleDisabled = busy || fromEnv;
  const showTokenSetup = awaitingToken && !configured && !fromEnv;

  return (
    <section className="integrations-section" aria-labelledby="cloudflare-heading">
      <div className="integrations-section-top">
        <div className="integrations-section-head">
          <h2 id="cloudflare-heading">Cloudflare</h2>
          <p>
            RealtimeKit powers group calls without opening ports. Media runs on Cloudflare&apos;s
            edge. Free tier includes 1,000 GB/month egress, then $0.05/GB.{" "}
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
        ) : null}
      </div>

      <label className="integrations-toggle channel-settings-toggle">
        <span className="integrations-toggle-label">Audio &amp; video calls</span>
        <input
          type="checkbox"
          role="switch"
          checked={toggleChecked}
          disabled={toggleDisabled}
          aria-label="Enable audio and video calls"
          onChange={(e) => void handleToggle(e.target.checked)}
        />
        <span className="toggle-switch" aria-hidden="true" />
      </label>

      {fromEnv ? (
        <p className="integrations-field-hint">
          Configured via server environment. Toggle is locked while env credentials are present.
        </p>
      ) : null}

      {showTokenSetup ? (
        <div className="integrations-fields">
          <SecretInput
            label="Cloudflare API token (Realtime Admin)"
            configured={false}
            value={cloudflareApiToken}
            onChange={setCloudflareApiToken}
            placeholder="Paste token to connect automatically"
          />
          <p className="integrations-field-hint">
            {busy
              ? "Connecting to Cloudflare and setting up RealtimeKit…"
              : `CCO will verify the token, connect to Cloudflare, and create a RealtimeKit app for ${name || "your church"} if needed.`}
          </p>
          {!busy ? (
            <button
              type="button"
              className="btn btn-secondary integrations-action-btn"
              onClick={() => setAwaitingToken(false)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {configured && !showTokenSetup ? (
        <div className="integrations-field-hint">
          {accountId ? (
            <p>
              Account <code>{accountId}</code>
              {appId ? (
                <>
                  {" · "}
                  App <code>{appId}</code>
                </>
              ) : null}
            </p>
          ) : null}
          {presetsConfigured ? (
            <p>Preset roles detected from your RealtimeKit app.</p>
          ) : (
            <p>
              Presets not auto-detected. Create <code>host</code>, <code>group_call_participant</code>
              , and <code>guest</code> in the RealtimeKit dashboard, or override via env vars.
            </p>
          )}
        </div>
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
  const [realtimeKitAccountId, setRealtimeKitAccountId] = useState("");
  const [realtimeKitAppId, setRealtimeKitAppId] = useState("");
  const [realtimeKitPresetsConfigured, setRealtimeKitPresetsConfigured] = useState(false);
  const [pcoSyncing, setPcoSyncing] = useState(false);
  const [pcoSyncResult, setPcoSyncResult] = useState<string | null>(null);
  const [pcoSyncError, setPcoSyncError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [settings, redirectUris] = await Promise.all([
          apiFetch<IntegrationsSettings>("/api/v1/settings/integrations"),
          fetch("/api/v1/setup/redirect-uris").then((r) => r.json() as Promise<SetupRedirectUris>),
        ]);

        setName(settings.name);
        setClientId(settings.clientId);
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

      <CloudflareCallsSection
        name={name}
        configured={realtimeKitConfigured}
        fromEnv={realtimeKitFromEnv}
        accountId={realtimeKitAccountId}
        appId={realtimeKitAppId}
        presetsConfigured={realtimeKitPresetsConfigured}
        onStatusChange={(status) => {
          setRealtimeKitConfigured(status.realtimeKitConfigured ?? false);
          setRealtimeKitFromEnv(status.realtimeKitFromEnv ?? false);
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
