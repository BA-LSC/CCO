"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import { SetupLoading } from "@/components/SetupLoading";
import { SetupThemeShell } from "@/components/SetupThemeShell";
import { WebhookSecretsField } from "@/components/WebhookSecretsField";
import { apiFetch } from "@/lib/api";
import type { SetupRedirectUris } from "@/lib/setup";

type SetupDraft = {
  name: string;
  clientId: string;
  hasClientSecret: boolean;
  webhookConfigured: boolean;
  webhookSecretCount: number;
  webhooksEnabled: boolean;
  credentialsSaved: boolean;
  signInRedirectUri: string | null;
  webhookUrl: string | null;
};

type SetupMe = {
  configured: boolean;
  isOrgAdmin: boolean;
  hasPcoConnection: boolean;
  draft: SetupDraft | null;
};

type Phase = "credentials" | "sign-in";

const SETUP_TOKEN_KEY = "cco_setup_token";

function getStoredSetupToken(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(SETUP_TOKEN_KEY);
  if (stored) return stored;

  const match = document.cookie.match(/(?:^|;\s*)cco_setup_token=([^;]*)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function storeSetupToken(token: string) {
  localStorage.setItem(SETUP_TOKEN_KEY, token);
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `cco_setup_token=${encodeURIComponent(token)}; path=/; max-age=604800; samesite=lax${secure}`;
}

function setupDraftHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getStoredSetupToken();
  if (token) headers["X-Setup-Token"] = token;
  return headers;
}

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<Phase>("credentials");
  const [uris, setUris] = useState<SetupRedirectUris | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [signInRedirectUri, setSignInRedirectUri] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookSecretCount, setWebhookSecretCount] = useState(0);
  const [webhooksEnabled, setWebhooksEnabled] = useState(false);
  const [hasClientSecret, setHasClientSecret] = useState(false);

  const tryFinishSetup = useCallback(async () => {
    try {
      await apiFetch<{ ok: boolean; redirectTo: string }>("/api/v1/setup/finish", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.replace("/groups?synced=1");
      return true;
    } catch {
      return false;
    }
  }, [router]);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(window.location.search);
      const forceCredentials =
        params.get("step") === "credentials" || params.get("edit") === "1";

      try {
        const [statusRes, draftResRaw, redirectUris] = await Promise.all([
          fetch("/api/v1/setup/status").then((r) => r.json() as Promise<{
            configured: boolean;
            signInAvailable?: boolean;
          }>),
          fetch("/api/v1/setup/draft", { headers: setupDraftHeaders() }),
          fetch("/api/v1/setup/redirect-uris").then((r) => r.json() as Promise<SetupRedirectUris>),
        ]);

        const draftRes = draftResRaw.ok
          ? ((await draftResRaw.json()) as { configured: boolean; draft: SetupDraft | null })
          : { configured: false, draft: null };

        if (statusRes.configured || draftRes.configured) {
          router.replace("/groups");
          return;
        }

        setUris(redirectUris);
        setSignInRedirectUri(redirectUris.signInRedirectUri);
        setWebhookUrl(redirectUris.webhookUrl);

        if (draftRes.draft) {
          setName(draftRes.draft.name);
          setClientId(draftRes.draft.clientId);
          setHasClientSecret(draftRes.draft.hasClientSecret);
          if (draftRes.draft.signInRedirectUri) {
            setSignInRedirectUri(draftRes.draft.signInRedirectUri);
          }
          if (draftRes.draft.webhookUrl) {
            setWebhookUrl(draftRes.draft.webhookUrl);
          }
          setWebhookSecretCount(draftRes.draft.webhookSecretCount ?? 0);
          setWebhooksEnabled(draftRes.draft.webhooksEnabled ?? draftRes.draft.webhookSecretCount > 0);
          if (!forceCredentials && draftRes.draft.credentialsSaved) {
            setPhase("sign-in");
          }
        } else if (!forceCredentials && statusRes.signInAvailable) {
          setPhase("sign-in");
        }

        let me: SetupMe | null = null;
        try {
          me = await apiFetch<SetupMe>("/api/v1/setup/me");
        } catch {
          /* not signed in yet */
        }

        if (me?.configured) {
          router.replace("/groups");
          return;
        }

        if (me && !me.isOrgAdmin) {
          router.replace("/setup/denied");
          return;
        }

        if (me?.hasPcoConnection && draftRes.draft?.credentialsSaved) {
          const finished = await tryFinishSetup();
          if (finished) return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load setup");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router, tryFinishSetup]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | boolean> = {
        name,
        clientId,
        signInRedirectUri,
        webhooksEnabled,
      };
      if (clientSecret.trim()) body.clientSecret = clientSecret;
      if (webhooksEnabled) {
        body.webhookUrl = webhookUrl;
        if (webhookSecret.trim()) body.webhookSecret = webhookSecret;
      }

      const res = await fetch("/api/v1/setup/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...setupDraftHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save setup");
      }

      const payload = (await res.json()) as { setupToken?: string };
      if (payload.setupToken) {
        storeSetupToken(payload.setupToken);
      }

      setClientSecret("");
      setWebhookSecret("");
      setHasClientSecret(true);
      if (webhooksEnabled && webhookSecret.trim()) {
        setWebhookSecretCount(webhookSecret.split(/\r?\n/).filter((line) => line.trim()).length);
      } else if (!webhooksEnabled) {
        setWebhookSecretCount(0);
      }
      setPhase("sign-in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <SetupLoading label="Loading setup" />;
  }

  return (
    <SetupThemeShell>
      <div className="setup-form-card">
        <p className="setup-eyebrow">First-time setup</p>
        <h1 className="setup-page-title">Connect Planning Center</h1>

        {phase === "credentials" ? (
          <>
            <p className="setup-page-lede">
              Paste your church&apos;s PCO developer app credentials below. Register the OAuth
              redirect URI in Planning Center; enable webhooks if you want membership sync feedback.
            </p>

            <form className="setup-form" onSubmit={(e) => void handleSubmit(e)}>
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
              <label className="field">
                <span>OAuth client secret</span>
                <input
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required={!hasClientSecret}
                  type="password"
                  autoComplete="new-password"
                  placeholder={hasClientSecret ? "Leave blank to keep saved secret" : undefined}
                />
              </label>
              <label className="field">
                <span>OAuth redirect URI</span>
                <input
                  value={signInRedirectUri}
                  onChange={(e) => setSignInRedirectUri(e.target.value)}
                  required
                  type="url"
                  autoComplete="off"
                  placeholder={uris?.defaultSignInRedirectUri ?? "https://chat.example.com/api/auth/pco/callback"}
                />
                <span className="help-text">
                  <a href="https://developer.planning.center/" target="_blank" rel="noreferrer">
                    developer.planning.center
                  </a>
                </span>
              </label>

              <hr className="setup-form-divider" aria-hidden="true" />

              <label className="setup-form-toggle">
                <span>Enable webhook feedback</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={webhooksEnabled}
                  onChange={(e) => setWebhooksEnabled(e.target.checked)}
                  aria-label="Enable webhook feedback"
                />
                <span className="toggle-switch" aria-hidden="true" />
              </label>

              {webhooksEnabled ? (
                <>
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
                  <WebhookSecretsField
                    value={webhookSecret}
                    onChange={setWebhookSecret}
                    configured={webhookSecretCount > 0}
                    configuredCount={webhookSecretCount}
                    placeholder={
                      webhookSecretCount > 0
                        ? `${webhookSecretCount} secret(s) saved — paste new lines to replace all`
                        : undefined
                    }
                  />
                </>
              ) : null}

              {error && (
                <p className="help-text error-text" role="alert">
                  {error}
                </p>
              )}

              <div className="setup-form-actions">
                <button type="submit" className="setup-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save credentials"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="setup-page-lede">
              Credentials saved. Sign in with Planning Center to verify you are an organization
              administrator and finish setup.
            </p>

            {error && (
              <p className="help-text error-text" role="alert">
                {error}
              </p>
            )}

            <div className="setup-form-actions setup-form-actions-start">
              <PcoSignInButton href="/auth/sign-in/start?next=/setup" className="setup-btn-primary">
                Sign in with Planning Center
              </PcoSignInButton>
              <Link href="/setup?step=credentials" className="setup-btn-secondary">
                Edit credentials
              </Link>
            </div>
          </>
        )}
      </div>
    </SetupThemeShell>
  );
}
