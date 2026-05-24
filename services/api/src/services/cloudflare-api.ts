const CF_API = "https://api.cloudflare.com/client/v4";

type CloudflareV4Result<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ message: string }>;
};

/** Realtime Kit endpoints use `data` instead of the standard v4 `result` envelope. */
type RealtimeKitResult<T> = {
  success: boolean;
  data: T;
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

function cloudflareErrorDetail(
  res: Response,
  errors?: Array<{ message: string }>,
): string {
  return errors?.map((e) => e.message).join("; ") ?? res.statusText;
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

  const json = (await res.json()) as CloudflareV4Result<T>;
  if (!res.ok || !json.success) {
    throw new CloudflareApiError(
      cloudflareErrorDetail(res, json.errors) || "Cloudflare API request failed",
      res.status,
    );
  }

  return json.result;
}

async function cfRealtimeKitRequest<T>(
  apiToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json()) as RealtimeKitResult<T>;
  if (!res.ok || !json.success) {
    throw new CloudflareApiError(
      cloudflareErrorDetail(res, json.errors) || "Cloudflare Realtime Kit request failed",
      res.status,
    );
  }

  return json.data;
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
  const apps = await cfRealtimeKitRequest<RealtimeKitApp[] | undefined>(
    apiToken,
    `/accounts/${accountId}/realtime/kit/apps`,
  );
  return apps ?? [];
}

export async function createRealtimeKitApp(
  accountId: string,
  apiToken: string,
  name: string,
): Promise<RealtimeKitApp> {
  const data = await cfRealtimeKitRequest<{ app: RealtimeKitApp }>(
    apiToken,
    `/accounts/${accountId}/realtime/kit/apps`,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
  if (!data?.app?.id) {
    throw new CloudflareApiError("Unexpected RealtimeKit app create response");
  }
  return data.app;
}

export type RealtimeKitPreset = {
  name: string;
};

export async function listRealtimeKitPresets(
  accountId: string,
  appId: string,
  apiToken: string,
): Promise<RealtimeKitPreset[]> {
  const presets = await cfRealtimeKitRequest<RealtimeKitPreset[] | undefined>(
    apiToken,
    `/accounts/${accountId}/realtime/kit/${appId}/presets`,
  );
  return presets ?? [];
}
