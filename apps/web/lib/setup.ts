const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

export type SetupStatus = {
  configured: boolean;
  churchName?: string | null;
  signInAvailable?: boolean;
  credentialsInDb?: boolean;
};

export type SetupRedirectUris = {
  signInRedirectUri: string;
  webhookUrl: string;
  apiRedirectUri?: string;
  mobileRedirectUri?: string;
  defaultSignInRedirectUri?: string;
  defaultWebhookUrl?: string;
};

function setupStatusUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/v1/setup/status";
  }
  return `${API_URL}/v1/setup/status`;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  try {
    const res = await fetch(setupStatusUrl(), { cache: "no-store" });
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
  return `${API_URL}/v1/setup/redirect-uris`;
}

export async function fetchSetupRedirectUris(): Promise<SetupRedirectUris | null> {
  try {
    const res = await fetch(redirectUrisUrl(), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SetupRedirectUris;
  } catch {
    return null;
  }
}
