"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InstallThemeShell } from "@/components/InstallThemeShell";
import {
  CLOUDFLARE_TOKEN_TEMPLATE_URL,
  createInstallSession,
  getProvisionStatus,
  listCloudflareZones,
  saveDomainSelection,
  startProvision,
  verifyCloudflareToken,
  type CloudflareZoneSummary,
  type ProvisionStatusResponse,
} from "@/lib/install-api";

type WizardStep = "welcome" | "cloudflare" | "domains" | "deploy";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "cloudflare", label: "Cloudflare" },
  { id: "domains", label: "Domains" },
  { id: "deploy", label: "Deploy" },
];

const SESSION_STORAGE_KEY = "cco-install-session-id";

export function InstallWizard() {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [churchName, setChurchName] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [zones, setZones] = useState<CloudflareZoneSummary[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [chatHostname, setChatHostname] = useState("");
  const [apiHostname, setApiHostname] = useState("");
  const [provisionStatus, setProvisionStatus] = useState<ProvisionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) setSessionId(stored);
  }, []);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.id === step), [step]);
  const progressPct = useMemo(
    () => Math.round(((stepIndex + 1) / STEPS.length) * 100),
    [stepIndex],
  );

  const persistSession = useCallback((id: string) => {
    setSessionId(id);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }, []);

  const handleWelcome = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createInstallSession(churchName.trim());
      persistSession(result.sessionId);
      setStep("cloudflare");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async () => {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await verifyCloudflareToken(sessionId, apiToken.trim());
      const zoneList = await listCloudflareZones(sessionId);
      setZones(zoneList.zones);
      if (zoneList.zones[0]) {
        setSelectedZoneId(zoneList.zones[0].id);
        setChatHostname(`chat.${zoneList.zones[0].name}`);
        setApiHostname(`api.${zoneList.zones[0].name}`);
      }
      setStep("domains");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Token verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDomains = async () => {
    if (!sessionId || !selectedZoneId) return;
    setError(null);
    setLoading(true);
    try {
      await saveDomainSelection(sessionId, {
        zoneId: selectedZoneId,
        chatHostname: chatHostname.trim(),
        apiHostname: apiHostname.trim(),
      });
      setStep("deploy");
      await handleStartDeploy(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save domains");
    } finally {
      setLoading(false);
    }
  };

  const handleStartDeploy = async (id: string) => {
    setError(null);
    await startProvision(id);
    pollProvision(id);
  };

  const pollProvision = useCallback((id: string) => {
    const tick = async () => {
      try {
        const status = await getProvisionStatus(id);
        setProvisionStatus(status);
        if (status.complete) {
          if (status.chatUrl) {
            window.setTimeout(() => {
              window.location.href = `${status.chatUrl}/setup?install=complete`;
            }, 1500);
          }
          return;
        }
        if (status.error && status.stepStatus[status.currentStep]?.status === "failed") {
          setError(status.error);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load provision status");
        return;
      }
      window.setTimeout(() => void tick(), 2500);
    };
    void tick();
  }, []);

  const onZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    const zone = zones.find((z) => z.id === zoneId);
    if (zone) {
      setChatHostname(`chat.${zone.name}`);
      setApiHostname(`api.${zone.name}`);
    }
  };

  return (
    <InstallThemeShell>
      <div className="install-wizard">
        <header className="install-wizard-header">
          <p className="setup-eyebrow">CCO Install</p>
          <h1 className="setup-page-title">Bring your church online</h1>
          <p className="setup-page-lede">
            Deploy Chat Center Online into your Cloudflare account — no server or terminal required.
          </p>
        </header>

        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Install progress"
          className="install-progress"
        >
          <div className="install-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <ol className="install-step-nav" aria-label="Install steps">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={[
                "install-step-nav-item",
                i === stepIndex ? "is-active" : "",
                i < stepIndex ? "is-complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>

        <section className="setup-form-card" aria-live="polite">
          {step === "welcome" && (
            <>
              <h2 className="install-step-title">Welcome</h2>
              <p className="install-step-body">
                We&apos;ll guide you through connecting Cloudflare and deploying CCO for your church.
              </p>
              <div className="setup-form">
                <label className="field" htmlFor="churchName">
                  <span>Church name</span>
                  <input
                    id="churchName"
                    value={churchName}
                    onChange={(e) => setChurchName(e.target.value)}
                    placeholder="Grace Community Church"
                    autoComplete="organization"
                  />
                </label>
                <div className="setup-form-actions">
                  <button
                    type="button"
                    className="setup-btn-primary"
                    disabled={loading || !churchName.trim()}
                    onClick={() => void handleWelcome()}
                  >
                    {loading ? "Starting…" : "Continue"}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === "cloudflare" && (
            <>
              <h2 className="install-step-title">Cloudflare API token</h2>
              <p className="install-step-body">
                Create a custom token with account permissions (Workers Scripts, D1, R2, KV, Queues,
                Secrets Store Write, Realtime) and zone permissions for your domain (DNS, Workers Routes,
                Cache Rules Edit).{" "}
                <a href={CLOUDFLARE_TOKEN_TEMPLATE_URL} target="_blank" rel="noopener noreferrer">
                  Open Cloudflare token page
                </a>
              </p>
              <div className="setup-form">
                <label className="field" htmlFor="apiToken">
                  <span>API token</span>
                  <input
                    id="apiToken"
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Paste token here"
                    autoComplete="off"
                  />
                </label>
                <div className="setup-form-actions">
                  <button
                    type="button"
                    className="setup-btn-secondary"
                    onClick={() => setStep("welcome")}
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="setup-btn-primary"
                    disabled={loading || !apiToken.trim()}
                    onClick={() => void handleVerifyToken()}
                  >
                    {loading ? "Verifying…" : "Verify token"}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === "domains" && (
            <>
              <h2 className="install-step-title">Domains</h2>
              <p className="install-step-body">
                Choose the zone where chat and API hostnames will live. SSL must cover both hostnames.
              </p>
              <div className="setup-form">
                <label className="field" htmlFor="zone">
                  <span>Zone</span>
                  <select id="zone" value={selectedZoneId} onChange={(e) => onZoneChange(e.target.value)}>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} ({zone.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="chatHost">
                  <span>Chat hostname</span>
                  <input
                    id="chatHost"
                    value={chatHostname}
                    onChange={(e) => setChatHostname(e.target.value)}
                  />
                </label>
                <label className="field" htmlFor="apiHost">
                  <span>API hostname</span>
                  <input
                    id="apiHost"
                    value={apiHostname}
                    onChange={(e) => setApiHostname(e.target.value)}
                  />
                </label>
                <p className="install-step-note">
                  Requires Cloudflare Workers Paid (~$5/month). RealtimeKit usage may incur additional
                  charges after beta.
                </p>
                <div className="setup-form-actions">
                  <button
                    type="button"
                    className="setup-btn-secondary"
                    onClick={() => setStep("cloudflare")}
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="setup-btn-primary"
                    disabled={loading || !selectedZoneId || !chatHostname.trim() || !apiHostname.trim()}
                    onClick={() => void handleDomains()}
                  >
                    {loading ? "Saving…" : "Start deploy"}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === "deploy" && (
            <>
              <h2 className="install-step-title">Deploy progress</h2>
              <p className="install-step-body">
                Provisioning D1, R2, Workers, DNS, and related resources. This usually takes a few
                minutes.
              </p>
              {provisionStatus ? (
                <ul className="install-deploy-steps">
                  {Object.entries(provisionStatus.stepStatus).map(([name, info]) => (
                    <li
                      key={name}
                      className={[
                        "install-deploy-step",
                        info.status === "failed" ? "is-failed" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span>{name.replace(/_/g, " ")}</span>
                      <span className="install-deploy-step-status">{info.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="install-step-body">Starting provision…</p>
              )}
              {provisionStatus?.complete && (
                <p className="install-success-text">Complete — redirecting to your church setup…</p>
              )}
            </>
          )}

          {error && <p className="error-text">{error}</p>}
        </section>
      </div>
    </InstallThemeShell>
  );
}
