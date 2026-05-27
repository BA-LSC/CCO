import { cfRequest, CloudflareApiError } from "./cloudflare-api";

export type WorkerCustomDomain = {
  id: string;
  hostname: string;
  service: string;
  environment: string;
};

export async function listWorkerCustomDomains(
  accountId: string,
  apiToken: string,
): Promise<WorkerCustomDomain[]> {
  try {
    return await cfRequest<WorkerCustomDomain[]>(
      apiToken,
      `/accounts/${accountId}/workers/domains`,
    );
  } catch {
    return [];
  }
}

export async function ensureWorkerCustomDomain(
  accountId: string,
  apiToken: string,
  params: { hostname: string; service: string; environment?: string },
): Promise<{ hostname: string; created: boolean }> {
  const hostname = params.hostname.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const service = params.service.trim();
  const environment = params.environment?.trim() || "production";

  const existing = await listWorkerCustomDomains(accountId, apiToken);
  if (existing.some((entry) => entry.hostname === hostname && entry.service === service)) {
    return { hostname, created: false };
  }

  try {
    await cfRequest<WorkerCustomDomain>(apiToken, `/accounts/${accountId}/workers/domains`, {
      method: "POST",
      body: JSON.stringify({ hostname, service, environment }),
    });
    return { hostname, created: true };
  } catch (err) {
    const message = err instanceof CloudflareApiError ? err.message : String(err);
    throw new Error(`Failed to attach Worker custom domain ${hostname}: ${message}`);
  }
}
