"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "2.5rem 1.25rem 4rem",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.875rem" }}>CCO Install</p>
        <h1 style={{ margin: "0.35rem 0 0", fontSize: "1.75rem", fontWeight: 700 }}>
          Bring your church online
        </h1>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem", lineHeight: 1.5 }}>
          Deploy Chat Center Online into your Cloudflare account — no server or terminal required.
        </p>
      </header>

      <div
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--surface)",
          overflow: "hidden",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: "100%",
            background: "var(--accent)",
            transition: "width 0.25s ease",
          }}
        />
      </div>

      <ol
        style={{
          display: "flex",
          gap: "0.5rem",
          listStyle: "none",
          padding: 0,
          margin: "0 0 2rem",
          flexWrap: "wrap",
        }}
      >
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            style={{
              fontSize: "0.8rem",
              color: i <= stepIndex ? "var(--text)" : "var(--muted)",
              fontWeight: i === stepIndex ? 600 : 400,
            }}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.5rem",
        }}
      >
        {step === "welcome" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Welcome</h2>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              We&apos;ll guide you through connecting Cloudflare and deploying CCO for your church.
            </p>
            <div className="field">
              <label htmlFor="churchName">Church name</label>
              <input
                id="churchName"
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="Grace Community Church"
                autoComplete="organization"
              />
            </div>
            <button type="button" disabled={loading || !churchName.trim()} onClick={() => void handleWelcome()}>
              {loading ? "Starting…" : "Continue"}
            </button>
          </>
        )}

        {step === "cloudflare" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Cloudflare API token</h2>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Create a token with Workers, D1, R2, KV, Queues, DNS, and Realtime permissions for your
              zone.{" "}
              <a href={CLOUDFLARE_TOKEN_TEMPLATE_URL} target="_blank" rel="noopener noreferrer">
                Open Cloudflare token page
              </a>
            </p>
            <div className="field">
              <label htmlFor="apiToken">API token</label>
              <input
                id="apiToken"
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Paste token here"
                autoComplete="off"
              />
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setStep("welcome")}
                disabled={loading}
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading || !apiToken.trim()}
                onClick={() => void handleVerifyToken()}
              >
                {loading ? "Verifying…" : "Verify token"}
              </button>
            </div>
          </>
        )}

        {step === "domains" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Domains</h2>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Choose the zone where chat and API hostnames will live. SSL must cover both hostnames.
            </p>
            <div className="field">
              <label htmlFor="zone">Zone</label>
              <select id="zone" value={selectedZoneId} onChange={(e) => onZoneChange(e.target.value)}>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} ({zone.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="chatHost">Chat hostname</label>
              <input
                id="chatHost"
                value={chatHostname}
                onChange={(e) => setChatHostname(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="apiHost">API hostname</label>
              <input
                id="apiHost"
                value={apiHostname}
                onChange={(e) => setApiHostname(e.target.value)}
              />
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
              Requires Cloudflare Workers Paid (~$5/month). RealtimeKit usage may incur additional
              charges after beta.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="button" className="secondary" onClick={() => setStep("cloudflare")} disabled={loading}>
                Back
              </button>
              <button
                type="button"
                disabled={loading || !selectedZoneId || !chatHostname.trim() || !apiHostname.trim()}
                onClick={() => void handleDomains()}
              >
                {loading ? "Saving…" : "Start deploy"}
              </button>
            </div>
          </>
        )}

        {step === "deploy" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Deploy progress</h2>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              Provisioning D1, R2, Workers, DNS, and related resources. This usually takes a few
              minutes.
            </p>
            {provisionStatus ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0" }}>
                {Object.entries(provisionStatus.stepStatus).map(([name, info]) => (
                  <li
                    key={name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "0.35rem 0",
                      fontSize: "0.85rem",
                      color: info.status === "failed" ? "var(--danger)" : "var(--text)",
                    }}
                  >
                    <span>{name.replace(/_/g, " ")}</span>
                    <span style={{ color: "var(--muted)" }}>{info.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--muted)" }}>Starting provision…</p>
            )}
            {provisionStatus?.complete && (
              <p style={{ color: "var(--success)" }}>
                Complete — redirecting to your church setup…
              </p>
            )}
          </>
        )}

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
