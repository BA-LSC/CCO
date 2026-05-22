import { getOrganizationWithOAuthCredentials } from "../services/org-oauth";

/** Env-derived default — used before org URLs are saved during setup. */
export function getDefaultPcoWebRedirectUri(): string {
  if (process.env.PCO_WEB_REDIRECT_URI?.trim()) {
    return process.env.PCO_WEB_REDIRECT_URI.trim();
  }
  const base = process.env.WEB_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/pco/callback`;
}

export function getDefaultPcoApiRedirectUri(): string {
  if (process.env.PCO_REDIRECT_URI?.trim()) {
    return process.env.PCO_REDIRECT_URI.trim();
  }
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
  return `${apiUrl.replace(/\/$/, "")}/auth/pco/callback`;
}

export function getDefaultPcoMobileRedirectUri(): string {
  if (process.env.PCO_MOBILE_REDIRECT_URI?.trim()) {
    return process.env.PCO_MOBILE_REDIRECT_URI.trim();
  }
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
  return `${apiUrl.replace(/\/$/, "")}/auth/pco/mobile/callback`;
}

export function getDefaultPcoWebhookUrl(): string {
  if (process.env.PCO_WEBHOOK_URL?.trim()) {
    return process.env.PCO_WEBHOOK_URL.trim();
  }
  if (process.env.PCO_REDIRECT_URI?.trim()) {
    const base = process.env.PCO_REDIRECT_URI.trim().replace(/\/auth\/pco\/callback\/?$/, "");
    return `${base}/webhooks/pco`;
  }
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
  return `${apiUrl.replace(/\/$/, "")}/webhooks/pco`;
}

function looksLikeInternalServiceUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "api" || hostname === "web";
  } catch {
    return false;
  }
}

export function resolvePcoWebhookUrl(saved: string | null | undefined): string {
  const trimmed = saved?.trim();
  if (trimmed && !looksLikeInternalServiceUrl(trimmed)) return trimmed;
  return getDefaultPcoWebhookUrl();
}

export async function getPcoWebRedirectUri(): Promise<string> {
  const org = await getOrganizationWithOAuthCredentials();
  const saved = org?.pcoWebRedirectUri?.trim();
  if (saved) return saved;
  return getDefaultPcoWebRedirectUri();
}

export async function getPcoWebhookUrl(): Promise<string> {
  const org = await getOrganizationWithOAuthCredentials();
  return resolvePcoWebhookUrl(org?.pcoWebhookUrl);
}

export function getPcoApiRedirectUri(): string {
  return getDefaultPcoApiRedirectUri();
}

export function getPcoMobileRedirectUri(): string {
  return getDefaultPcoMobileRedirectUri();
}

export async function getAllowedPcoRedirectUris(): Promise<string[]> {
  const uris = new Set<string>([
    getDefaultPcoWebRedirectUri(),
    getDefaultPcoApiRedirectUri(),
    getDefaultPcoMobileRedirectUri(),
  ]);
  try {
    uris.add(await getPcoWebRedirectUri());
  } catch {
    // Fall back to env defaults when org lookup is unavailable.
  }
  return [...uris];
}

export async function isAllowedPcoRedirectUri(uri: string): Promise<boolean> {
  const allowed = await getAllowedPcoRedirectUris();
  return allowed.includes(uri);
}
