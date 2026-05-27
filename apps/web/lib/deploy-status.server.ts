import Redis from "ioredis";
import { fetchFromApi } from "@/lib/api-fetch-server";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";

const DEPLOY_DRAINING_KEY = "cco:deploy:draining";
export const DEPLOY_SIGNAL_CHANNEL = "cco:deploy:signal";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (process.env.CF_DEPLOY_KV === "1" && isCloudflareDeployTarget()) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, {
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      commandTimeout: 1000,
      lazyConnect: true,
    });
  }
  return redis;
}

function hasKvRestCredentials(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim() &&
      process.env.CLOUDFLARE_KV_DEPLOY_NAMESPACE_ID?.trim(),
  );
}

async function readKvDeployFlag(key: string): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const namespaceId = process.env.CLOUDFLARE_KV_DEPLOY_NAMESPACE_ID?.trim();
  if (!accountId || !apiToken || !namespaceId) return null;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.text();
}

async function readDeployDrainingFromApi(): Promise<boolean | null> {
  try {
    const res = await fetchFromApi("/health", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { draining?: boolean };
    return Boolean(data.draining);
  } catch {
    return null;
  }
}

/** True while deploy/bootstrap has set the draining flag. */
export async function isDeployDraining(): Promise<boolean> {
  if (isCloudflareDeployTarget()) {
    const fromApi = await readDeployDrainingFromApi();
    if (fromApi != null) return fromApi;
    return false;
  }

  if (process.env.CF_DEPLOY_KV === "1" || !process.env.REDIS_URL) {
    const fromApi = await readDeployDrainingFromApi();
    if (fromApi != null) return fromApi;

    const kvValue = await readKvDeployFlag(DEPLOY_DRAINING_KEY);
    if (kvValue != null) return kvValue === "1";
  }

  const client = getRedis();
  if (!client) return false;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return false;
    return (await client.get(DEPLOY_DRAINING_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function readDeploySignalValue(): Promise<string | null> {
  if (isCloudflareDeployTarget()) {
    const draining = await readDeployDrainingFromApi();
    if (draining == null) return null;
    return draining ? "updating" : "ready";
  }

  if (process.env.CF_DEPLOY_KV === "1" || !process.env.REDIS_URL) {
    if (!hasKvRestCredentials()) {
      const draining = await readDeployDrainingFromApi();
      if (draining == null) return null;
      return draining ? "updating" : "ready";
    }
    return readKvDeployFlag(DEPLOY_SIGNAL_CHANNEL);
  }
  return null;
}
