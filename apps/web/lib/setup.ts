import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";
import { getServerApiOrigin, getServerApiOriginAsync } from "@/lib/api-origin";
import { fetchFromApi } from "@/lib/api-fetch-server";

export type SetupStatus = {
  configured: boolean;
  churchName?: string | null;
  signInAvailable?: boolean;
  credentialsInDb?: boolean;
  webhooksEnabled?: boolean;
};

export type SetupRedirectUris = {
  signInRedirectUri: string;
  webhookUrl: string;
  apiRedirectUri?: string;
  mobileRedirectUri?: string;
  defaultSignInRedirectUri?: string;
  defaultWebhookUrl?: string;
};

export type InstallSetupContext = {
  fromInstall: true;
  churchName: string;
  signInRedirectUri: string;
  webhookUrl: string;
  apiRedirectUri: string;
  mobileRedirectUri: string;
  cloudflarePlatformProvisioned: boolean;
  readOnlyUrls: boolean;
};

function setupStatusUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/v1/setup/status";
  }
  return `${getServerApiOrigin()}/v1/setup/status`;
}

async function setupStatusUrlAsync(): Promise<string> {
  if (typeof window !== "undefined") {
    return "/api/v1/setup/status";
  }
  return `${await getServerApiOriginAsync()}/v1/setup/status`;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/v1/setup/status", { cache: "no-store", credentials: "include" });
      if (!res.ok) return { configured: false, signInAvailable: false };
      return (await res.json()) as SetupStatus;
    }

    if (isCloudflareDeployTarget()) {
      try {
        const { env } = await getCloudflareContext({ async: true });
        const record = env as Record<string, unknown>;
        const webUrl =
          (typeof record.WEB_URL === "string" ? record.WEB_URL.trim() : "") ||
          (typeof record.NEXT_PUBLIC_WEB_URL === "string" ? record.NEXT_PUBLIC_WEB_URL.trim() : "");
        if (webUrl) {
          const res = await fetch(`${webUrl.replace(/\/$/, "")}/api/v1/setup/status`, {
            cache: "no-store",
          });
          if (res.ok) return (await res.json()) as SetupStatus;
        }
      } catch {
        // fall through to direct API fetch
      }
    }

    const res = await fetchFromApi("/v1/setup/status", { cache: "no-store" });
    if (!res.ok) return { configured: false, signInAvailable: false };
    return (await res.json()) as SetupStatus;
  } catch {
    return { configured: false, signInAvailable: false };
  }
}

function redirectUrisUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/v1/setup/redirect-uris";
  }
  return `${getServerApiOrigin()}/v1/setup/redirect-uris`;
}

export async function fetchSetupRedirectUris(): Promise<SetupRedirectUris | null> {
  try {
    const res =
      typeof window !== "undefined"
        ? await fetch(redirectUrisUrl(), { cache: "no-store" })
        : await fetchFromApi("/v1/setup/redirect-uris", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SetupRedirectUris;
  } catch {
    return null;
  }
}
