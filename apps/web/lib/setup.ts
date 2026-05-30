import { getServerApiOrigin } from "@/lib/api-origin";
import { fetchFromApi } from "@/lib/api-fetch-server";

export type SetupStatus = {
  configured: boolean;
  churchName?: string | null;
  signInAvailable?: boolean;
  credentialsInDb?: boolean;
  webhooksEnabled?: boolean;
  /** API proxy or worker unreachable — not the same as org setup incomplete. */
  unavailable?: boolean;
  errorMessage?: string;
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
  mobileRedirectUri?: string;
  cloudflarePlatformProvisioned: boolean;
  readOnlyUrls: boolean;
};

async function parseSetupStatusResponse(res: Response): Promise<SetupStatus> {
  if (res.ok) {
    return (await res.json()) as SetupStatus;
  }

  if (res.status >= 500 || res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; updating?: boolean };
    const fallback = body.updating
      ? "CCO is updating. Please wait a moment and try again."
      : "CCO is temporarily unavailable. Check that the API is running, then try again.";
    return {
      configured: false,
      signInAvailable: false,
      unavailable: true,
      errorMessage: typeof body.error === "string" ? body.error : fallback,
    };
  }

  return { configured: false, signInAvailable: false };
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/v1/setup/status", { cache: "no-store", credentials: "include" });
      const status = await parseSetupStatusResponse(res);
      if (status.configured) {
        const { writeCachedSetupStatus } = await import("@/lib/setup-status-cache");
        writeCachedSetupStatus(status);
      }
      return status;
    }

    const res = await fetchFromApi("/v1/setup/status", { cache: "no-store" });
    return parseSetupStatusResponse(res);
  } catch {
    return {
      configured: false,
      signInAvailable: false,
      unavailable: true,
      errorMessage: "CCO is temporarily unavailable. Check that the API is running, then try again.",
    };
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
