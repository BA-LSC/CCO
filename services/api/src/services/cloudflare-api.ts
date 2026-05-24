const CF_API = "https://api.cloudflare.com/client/v4";

type CloudflareResult<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ message: string }>;
};

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

async function cfRequest<T>(apiToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json()) as CloudflareResult<T>;
  if (!res.ok || !json.success) {
    const detail = json.errors?.map((e) => e.message).join("; ") ?? res.statusText;
    throw new CloudflareApiError(detail || "Cloudflare API request failed", res.status);
  }

  return json.result;
}

export async function verifyCloudflareApiToken(
  apiToken: string,
): Promise<{ id: string; status: string }> {
  return cfRequest<{ id: string; status: string }>(apiToken, "/user/tokens/verify");
}

export type CloudflareAccount = {
  id: string;
  name: string;
};

export async function listCloudflareAccounts(apiToken: string): Promise<CloudflareAccount[]> {
  return cfRequest<CloudflareAccount[]>(apiToken, "/accounts");
}

export type RealtimeKitApp = {
  id: string;
  name: string;
};

export async function listRealtimeKitApps(
  accountId: string,
  apiToken: string,
): Promise<RealtimeKitApp[]> {
  return cfRequest<RealtimeKitApp[]>(apiToken, `/accounts/${accountId}/realtime/kit/apps`);
}

export async function createRealtimeKitApp(
  accountId: string,
  apiToken: string,
  name: string,
): Promise<RealtimeKitApp> {
  return cfRequest<RealtimeKitApp>(apiToken, `/accounts/${accountId}/realtime/kit/apps`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export type RealtimeKitPreset = {
  name: string;
};

export async function listRealtimeKitPresets(
  accountId: string,
  appId: string,
  apiToken: string,
): Promise<RealtimeKitPreset[]> {
  return cfRequest<RealtimeKitPreset[]>(
    apiToken,
    `/accounts/${accountId}/realtime/kit/${appId}/presets`,
  );
}
