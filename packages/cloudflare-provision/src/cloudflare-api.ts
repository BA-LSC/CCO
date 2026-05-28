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

type CloudflareApiErrorEntry = {
  message: string;
  code?: number;
};

function cloudflareErrorDetail(
  res: Response,
  errors?: CloudflareApiErrorEntry[],
): string {
  if (!errors?.length) return res.statusText;
  return errors
    .map((entry) => {
      const code = entry.code != null ? `[${entry.code}] ` : "";
      return `${code}${entry.message}`;
    })
    .join("; ");
}

/** Parse a Cloudflare (or release artifact) JSON body without leaking raw SyntaxError. */
export function parseCloudflareJsonText(text: string, status: number): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const preview = trimmed.slice(0, 80).replace(/\s+/g, " ");
    throw new CloudflareApiError(
      `Expected JSON response (${status}) but received: ${preview}`,
      status,
    );
  }
}

export async function readCloudflareJson(res: Response): Promise<unknown> {
  const parsed = parseCloudflareJsonText(await res.text(), res.status);
  if (parsed === null) {
    throw new CloudflareApiError(
      `Cloudflare API returned an empty response (${res.status})`,
      res.status,
    );
  }
  return parsed;
}

export async function cfRequest<T>(apiToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await readCloudflareJson(res)) as CloudflareV4Result<T>;
  if (!res.ok || !json.success) {
    throw new CloudflareApiError(
      cloudflareErrorDetail(res, json.errors) || "Cloudflare API request failed",
      res.status,
    );
  }

  return json.result;
}

export async function cfRealtimeKitRequest<T>(
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

  const json = (await readCloudflareJson(res)) as RealtimeKitResult<T>;
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

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
};

export async function listCloudflareZones(apiToken: string): Promise<CloudflareZone[]> {
  return cfRequest<CloudflareZone[]>(apiToken, "/zones");
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
