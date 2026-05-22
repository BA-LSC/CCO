"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadingState } from "@/components/PageStates";
import { WebhookSecretsField } from "@/components/WebhookSecretsField";
import { apiFetch } from "@/lib/api";
import type { SetupRedirectUris } from "@/lib/setup";

const SECRET_MASK_DISPLAY = "•".repeat(20);

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
};

function MaskedSecretField({
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
    <label className="field secret-field">
      <span>{label}</span>
      <div className="secret-field-input-wrap">
        {showMask ? (
          <span className="secret-field-mask" aria-hidden="true">
            {SECRET_MASK_DISPLAY}
          </span>
        ) : null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          type="password"
          autoComplete="new-password"
          placeholder={showMask ? undefined : placeholder}
        />
      </div>
    </label>
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

  if (loading) return <LoadingState variant="page" label="Loading settings" />;

  return (
    <div className="page page-narrow settings-page">
      <div className="state-card setup-card">
        <p className="settings-back">
          <Link href="/groups">← Back to chats</Link>
        </p>
        <h1>Integration settings</h1>
        <p>
          Update Planning Center OAuth credentials, callback URL, and webhook configuration.
          Secret fields are stored encrypted and never shown after saving.
        </p>

        <form className="setup-form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>OAuth redirect URI</span>
            <input
              value={signInRedirectUri}
              onChange={(e) => setSignInRedirectUri(e.target.value)}
              required
              type="url"
              autoComplete="off"
              placeholder={
                uris?.defaultSignInRedirectUri ??
                "https://chat.example.com/api/auth/pco/callback"
              }
            />
          </label>
          <label className="field">
            <span>Webhook endpoint URL</span>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              required
              type="url"
              autoComplete="off"
              placeholder={uris?.defaultWebhookUrl ?? "https://api.example.com/webhooks/pco"}
            />
          </label>
          <label className="field">
            <span>Church name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="My Church"
            />
          </label>
          <label className="field">
            <span>OAuth client ID</span>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <MaskedSecretField
            label="OAuth client secret"
            configured={clientSecretConfigured}
            value={clientSecret}
            onChange={setClientSecret}
            placeholder="Leave blank to keep current"
          />
          <WebhookSecretsField
            value={webhookSecret}
            onChange={setWebhookSecret}
            configured={webhookConfigured}
            configuredCount={webhookSecretCount}
            placeholder="Leave blank to keep current secrets"
            helpText="Saving replaces all stored secrets."
          />

          <div className="settings-section">
            <h2>PWA push notifications</h2>
            <p className="help-text">
              VAPID keys are generated automatically. Set a contact email so installed PWA users
              can enable message notifications.
            </p>
            {vapidKeysConfigured ? (
              <p className="help-text" role="status">
                Push keys are ready{webPushConfigured ? " and notifications are enabled for PWA users." : "."}
              </p>
            ) : null}
            <label className="field">
              <span>VAPID contact email</span>
              <input
                value={vapidSubjectEmail}
                onChange={(e) => setVapidSubjectEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="notifications@yourchurch.org"
              />
            </label>
          </div>

          <div className="settings-section">
            <h2>Giphy search</h2>
            <p className="help-text">
              Add a Giphy API key to let chat members search and send GIFs from the composer.
              Get one at{" "}
              <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">
                developers.giphy.com
              </a>
              .
            </p>
            <MaskedSecretField
              label="Giphy API key"
              configured={giphyApiKeyConfigured}
              value={giphyApiKey}
              onChange={setGiphyApiKey}
              placeholder="Leave blank to keep current"
            />
          </div>

          {error && (
            <p className="help-text error-text" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="help-text" role="status">
              Settings saved.
            </p>
          )}

          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
