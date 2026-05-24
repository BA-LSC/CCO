"use client";

import { useEffect, useState } from "react";
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
  realtimeKitAccountId?: string;
  realtimeKitAppId?: string;
  realtimeKitTokenConfigured?: boolean;
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
  const showConfigured = configured && value === "" && !focused;

  return (
    <label className="integrations-field">
      <div className="integrations-field-head">
        <span className="integrations-field-label">{label}</span>
        {showConfigured ? (
          <span className="integrations-badge integrations-badge--success">Configured</span>
        ) : null}
      </div>
      <input
        className="integrations-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        type="password"
        autoComplete="new-password"
        placeholder={showConfigured ? "Leave blank to keep current" : placeholder}
      />
    </label>
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
  const [cloudflareAccountId, setCloudflareAccountId] = useState("");
  const [realtimeKitAppId, setRealtimeKitAppId] = useState("");
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");
  const [realtimeKitConfigured, setRealtimeKitConfigured] = useState(false);
  const [realtimeKitTokenConfigured, setRealtimeKitTokenConfigured] = useState(false);
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
        setCloudflareAccountId(settings.realtimeKitAccountId ?? "");
        setRealtimeKitAppId(settings.realtimeKitAppId ?? "");
        setRealtimeKitConfigured(settings.realtimeKitConfigured ?? false);
        setRealtimeKitTokenConfigured(settings.realtimeKitTokenConfigured ?? false);
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
    if (cloudflareAccountId.trim()) payload.cloudflareAccountId = cloudflareAccountId.trim();
    if (realtimeKitAppId.trim()) payload.realtimeKitAppId = realtimeKitAppId.trim();
    if (cloudflareApiToken.trim()) payload.cloudflareApiToken = cloudflareApiToken.trim();

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
      setRealtimeKitConfigured(updated.realtimeKitConfigured ?? false);
      setRealtimeKitTokenConfigured(updated.realtimeKitTokenConfigured ?? false);
      if (updated.realtimeKitAccountId) setCloudflareAccountId(updated.realtimeKitAccountId);
      if (updated.realtimeKitAppId) setRealtimeKitAppId(updated.realtimeKitAppId);
      setClientSecret("");
      setWebhookSecret("");
      setGiphyApiKey("");
      setCloudflareApiToken("");
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

      <form className="integrations-form" onSubmit={(e) => void handleSubmit(e)}>
        <section className="integrations-section" aria-labelledby="pco-oauth-heading">
          <div className="integrations-section-head">
            <h2 id="pco-oauth-heading">Planning Center OAuth</h2>
          </div>
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
        </section>

        <section className="integrations-section" aria-labelledby="pco-urls-heading">
          <div className="integrations-section-head">
            <h2 id="pco-urls-heading">Callback URLs</h2>
            <p>Use these in your Planning Center OAuth app and webhook subscriptions.</p>
          </div>
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
        </section>

        <section className="integrations-section" aria-labelledby="pco-webhooks-heading">
          <div className="integrations-section-head">
            <h2 id="pco-webhooks-heading">Webhooks</h2>
          </div>
          <WebhookSecretsField
            value={webhookSecret}
            onChange={setWebhookSecret}
            configured={webhookConfigured}
            configuredCount={webhookSecretCount}
            helpText="Saving replaces all stored webhook secrets."
          />
        </section>

        <section className="integrations-section" aria-labelledby="push-heading">
          <div className="integrations-section-head">
            <h2 id="push-heading">Push notifications</h2>
            <p>VAPID keys are generated automatically. Add a contact email for installed PWA users.</p>
          </div>
          <div className="integrations-fields">
            {pushStatus ? (
              <p className="integrations-inline-status">
                <span className="integrations-badge integrations-badge--success">{pushStatus}</span>
              </p>
            ) : null}
            <TextInput
              label="VAPID contact email"
              value={vapidSubjectEmail}
              onChange={setVapidSubjectEmail}
              type="email"
              autoComplete="email"
              placeholder="notifications@yourchurch.org"
            />
          </div>
        </section>

        <section className="integrations-section" aria-labelledby="realtimekit-heading">
          <div className="integrations-section-head">
            <h2 id="realtimekit-heading">Audio &amp; video calls</h2>
            <p>
              Cloudflare RealtimeKit powers group calls without opening ports on your server. Media
              runs on Cloudflare&apos;s edge. Free tier includes 1,000 GB/month egress, then $0.05/GB.{" "}
              <a
                href="https://developers.cloudflare.com/realtime/realtimekit/quickstart/"
                target="_blank"
                rel="noreferrer"
              >
                Setup guide
              </a>
            </p>
          </div>
          <div className="integrations-fields">
            {realtimeKitConfigured ? (
              <p className="integrations-inline-status">
                <span className="integrations-badge integrations-badge--success">Calls enabled</span>
              </p>
            ) : null}
            <TextInput
              label="Cloudflare account ID"
              value={cloudflareAccountId}
              onChange={setCloudflareAccountId}
              placeholder="From Cloudflare dashboard"
            />
            <TextInput
              label="RealtimeKit app ID"
              value={realtimeKitAppId}
              onChange={setRealtimeKitAppId}
              placeholder="From RealtimeKit app settings"
            />
            <SecretInput
              label="Cloudflare API token (Realtime Admin)"
              configured={realtimeKitTokenConfigured}
              value={cloudflareApiToken}
              onChange={setCloudflareApiToken}
              placeholder="Paste new token"
            />
            <p className="integrations-field-hint">
              Create presets named <code>host</code>, <code>group_call_participant</code>, and{" "}
              <code>guest</code> in the RealtimeKit dashboard (or override via env vars).
            </p>
          </div>
        </section>

        <section className="integrations-section" aria-labelledby="giphy-heading">
          <div className="integrations-section-head">
            <h2 id="giphy-heading">Giphy</h2>
            <p>
              Optional API key for GIF search in chat.{" "}
              <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">
                Get a key
              </a>
            </p>
          </div>
          <SecretInput
            label="API key"
            configured={giphyApiKeyConfigured}
            value={giphyApiKey}
            onChange={setGiphyApiKey}
            placeholder="Paste new key"
          />
        </section>

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
