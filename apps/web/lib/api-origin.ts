import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";
import { readRuntimeEnv, readRuntimeEnvAsync } from "@/lib/runtime-env";
import { deriveApiHostname } from "@/lib/websocket-url";

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Server-side API origin for OAuth exchange, setup, health probes, and upload presign.
 * Prefers explicit API_URL, then API_DOMAIN, then derives api.<zone> from WEB_URL.
 */
export function getServerApiOrigin(): string {
  return resolveServerApiOriginFromProcessEnv();
}

/** Cloudflare OpenNext server routes should prefer async context for worker bindings. */
export async function getServerApiOriginAsync(): Promise<string> {
  if (isCloudflareDeployTarget()) {
    try {
      const { env } = await getCloudflareContext({ async: true });
      const record = env as Record<string, unknown>;
      const apiUrl = typeof record.API_URL === "string" ? record.API_URL.trim() : "";
      if (apiUrl && !(isDockerInternalApiUrl(apiUrl))) {
        return normalizeOrigin(apiUrl);
      }
      const apiDomain = typeof record.API_DOMAIN === "string" ? record.API_DOMAIN.trim() : "";
      if (apiDomain) {
        return normalizeOrigin(apiDomain);
      }
      const webUrl =
        (typeof record.WEB_URL === "string" ? record.WEB_URL.trim() : "") ||
        (typeof record.NEXT_PUBLIC_WEB_URL === "string" ? record.NEXT_PUBLIC_WEB_URL.trim() : "");
      if (webUrl) {
        try {
          const parsed = new URL(normalizeOrigin(webUrl));
          return `${parsed.protocol}//${deriveApiHostname(parsed.hostname)}`;
        } catch {
          // fall through
        }
      }
    } catch {
      // fall through to env/process resolution
    }
  }

  const fromBindings = await resolveServerApiOriginFromBindings();
  if (fromBindings) return fromBindings;

  return resolveServerApiOriginFromProcessEnv();
}

function resolveServerApiOriginFromProcessEnv(): string {
  const bakedOrigin = readRuntimeEnv("SERVER_API_ORIGIN");
  if (bakedOrigin) {
    return normalizeOrigin(bakedOrigin);
  }

  const apiUrl = readRuntimeEnv("API_URL");
  if (apiUrl && !(isCloudflareDeployTarget() && isDockerInternalApiUrl(apiUrl))) {
    return normalizeOrigin(apiUrl);
  }

  const apiDomain = readRuntimeEnv("API_DOMAIN");
  if (apiDomain) {
    return normalizeOrigin(apiDomain);
  }

  const webUrl =
    readRuntimeEnv("WEB_URL") ||
    readRuntimeEnv("NEXT_PUBLIC_WEB_URL") ||
    readRuntimeEnv("CCO_DOMAIN");
  if (webUrl) {
    try {
      const parsed = new URL(normalizeOrigin(webUrl));
      return `${parsed.protocol}//${deriveApiHostname(parsed.hostname)}`;
    } catch {
      // fall through
    }
  }

  if (apiUrl) return normalizeOrigin(apiUrl);
  return "http://127.0.0.1:3001";
}

async function resolveServerApiOriginFromBindings(): Promise<string | null> {
  const apiUrl = await readRuntimeEnvAsync("API_URL");
  if (apiUrl && !isDockerInternalApiUrl(apiUrl)) {
    return normalizeOrigin(apiUrl);
  }

  const apiDomain = await readRuntimeEnvAsync("API_DOMAIN");
  if (apiDomain) {
    return normalizeOrigin(apiDomain);
  }

  const webUrl =
    (await readRuntimeEnvAsync("WEB_URL")) ||
    (await readRuntimeEnvAsync("NEXT_PUBLIC_WEB_URL")) ||
    (await readRuntimeEnvAsync("CCO_DOMAIN"));
  if (webUrl) {
    try {
      const parsed = new URL(normalizeOrigin(webUrl));
      return `${parsed.protocol}//${deriveApiHostname(parsed.hostname)}`;
    } catch {
      // fall through
    }
  }

  return null;
}
function isDockerInternalApiUrl(url: string): boolean {
  try {
    const host = new URL(normalizeOrigin(url)).hostname.toLowerCase();
    return host === "api" || host === "api.internal";
  } catch {
    return false;
  }
}
