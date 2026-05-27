import { CCO_INSTALL_ORIGIN } from "@cco/shared/install-origin";

function resolveInstallApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_INSTALL_API_URL;
  if (fromEnv !== undefined) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    // Same-origin on https://setup-c.co — API routes hit the install orchestrator worker.
    return "";
  }
  return "http://localhost:8787";
}

const DEFAULT_API_BASE = resolveInstallApiBase();

export type InstallSessionResponse = {
  sessionId: string;
  step: string;
};

export type CloudflareAccountSummary = {
  id: string;
  name: string;
};

export type CloudflareZoneSummary = {
  id: string;
  name: string;
  status: string;
};

export type ProvisionStepStatus = "pending" | "running" | "complete" | "failed";

export type ProvisionStatusResponse = {
  sessionId: string;
  churchName: string;
  currentStep: string;
  stepStatus: Record<string, { status: ProvisionStepStatus; error?: string }>;
  resources: Record<string, unknown>;
  error?: string;
  complete: boolean;
  chatUrl?: string;
  apiUrl?: string;
};

function apiBase(): string {
  return DEFAULT_API_BASE;
}

function sessionHeaders(sessionId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-install-session": sessionId,
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

export async function createInstallSession(churchName: string): Promise<InstallSessionResponse> {
  const res = await fetch(`${apiBase()}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ churchName }),
  });
  return parseJson(res);
}

export async function verifyCloudflareToken(
  sessionId: string,
  apiToken: string,
  accountId?: string,
): Promise<{ ok: boolean; accountId: string; accounts: CloudflareAccountSummary[] }> {
  const res = await fetch(`${apiBase()}/api/cloudflare/verify`, {
    method: "POST",
    headers: sessionHeaders(sessionId),
    body: JSON.stringify({ apiToken, accountId }),
  });
  return parseJson(res);
}

export async function listCloudflareZones(
  sessionId: string,
): Promise<{ zones: CloudflareZoneSummary[] }> {
  const res = await fetch(`${apiBase()}/api/cloudflare/zones`, {
    method: "GET",
    headers: sessionHeaders(sessionId),
  });
  return parseJson(res);
}

export async function saveDomainSelection(
  sessionId: string,
  params: { zoneId: string; chatHostname?: string; apiHostname?: string },
): Promise<{
  zone: CloudflareZoneSummary;
  chatHostname: string;
  apiHostname: string;
}> {
  const search = new URLSearchParams({ zoneId: params.zoneId });
  if (params.chatHostname) search.set("chatHostname", params.chatHostname);
  if (params.apiHostname) search.set("apiHostname", params.apiHostname);
  const res = await fetch(`${apiBase()}/api/cloudflare/zones?${search}`, {
    method: "GET",
    headers: sessionHeaders(sessionId),
  });
  return parseJson(res);
}

export async function startProvision(sessionId: string): Promise<{ ok: boolean; started: boolean }> {
  const res = await fetch(`${apiBase()}/api/provision/start`, {
    method: "POST",
    headers: sessionHeaders(sessionId),
  });
  return parseJson(res);
}

export async function getProvisionStatus(sessionId: string): Promise<ProvisionStatusResponse> {
  const res = await fetch(`${apiBase()}/api/provision/status`, {
    method: "GET",
    headers: sessionHeaders(sessionId),
  });
  return parseJson(res);
}

export { CCO_INSTALL_HOSTNAME, CCO_INSTALL_ORIGIN } from "@cco/shared/install-origin";

export const CLOUDFLARE_TOKEN_TEMPLATE_URL =
  "https://dash.cloudflare.com/profile/api-tokens";
