import { fetchFromApi } from "@/lib/api-fetch-server";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";

/** Env-derived default — used when org URLs are not saved yet. */
export function getDefaultPcoWebRedirectUri(): string {
  if (process.env.PCO_WEB_REDIRECT_URI?.trim()) {
    return process.env.PCO_WEB_REDIRECT_URI.trim();
  }
  const base = process.env.WEB_URL ?? "http://localhost:3000";
  const path = isCloudflareDeployTarget() || !base.includes("localhost")
    ? "/api/auth/pco/callback"
    : "/auth/pco/callback";
  return `${base.replace(/\/$/, "")}${path}`;
}

export function getLegacyPcoWebRedirectUri(): string {
  const base = process.env.WEB_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/pco/callback`;
}

export async function fetchPcoWebRedirectUri(): Promise<string> {
  try {
    const res = await fetchFromApi("/v1/setup/redirect-uris", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return getDefaultPcoWebRedirectUri();
    const data = (await res.json()) as { signInRedirectUri?: string };
    return data.signInRedirectUri?.trim() || getDefaultPcoWebRedirectUri();
  } catch {
    return getDefaultPcoWebRedirectUri();
  }
}

/** @deprecated use fetchPcoWebRedirectUri for org-configured URLs */
export function getPcoWebRedirectUri(): string {
  return getDefaultPcoWebRedirectUri();
}
