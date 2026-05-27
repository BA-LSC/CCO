import {
  bulkGetKvValues,
  deleteKvValue,
  getKvValue,
  putKvValue,
} from "../services/cloudflare-api-resources";
import { getWorkerBindings } from "../runtime/worker-context";
import { resolveCloudflareApiToken } from "../services/org-realtimekit";
import { getConfiguredOrganization } from "../services/org-oauth";

export type CloudflareKvConfig = {
  accountId: string;
  apiToken: string;
  namespaceId: string;
};

export async function resolvePresenceKvConfig(): Promise<CloudflareKvConfig | null> {
  if (getWorkerBindings()?.PRESENCE_KV) return null;
  const org = await getConfiguredOrganization();
  const tokenBundle = await resolveCloudflareApiToken();
  const namespaceId =
    org?.cloudflareKvPresenceNamespaceId?.trim() ||
    process.env.CLOUDFLARE_KV_PRESENCE_NAMESPACE_ID?.trim();
  if (!tokenBundle?.apiToken || !namespaceId) return null;
  return {
    accountId: tokenBundle.accountId || org?.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || "",
    apiToken: tokenBundle.apiToken,
    namespaceId,
  };
}

export async function resolveDeployKvConfig(): Promise<CloudflareKvConfig | null> {
  if (getWorkerBindings()?.DEPLOY_KV) return null;
  const org = await getConfiguredOrganization();
  const tokenBundle = await resolveCloudflareApiToken();
  const namespaceId =
    org?.cloudflareKvDeployNamespaceId?.trim() ||
    process.env.CLOUDFLARE_KV_DEPLOY_NAMESPACE_ID?.trim();
  if (!tokenBundle?.apiToken || !namespaceId) return null;
  return {
    accountId: tokenBundle.accountId || org?.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || "",
    apiToken: tokenBundle.apiToken,
    namespaceId,
  };
}

export async function kvPut(
  config: CloudflareKvConfig,
  key: string,
  value: string,
  expirationTtl?: number,
): Promise<void> {
  await putKvValue(config.accountId, config.apiToken, config.namespaceId, key, value, expirationTtl);
}

export async function kvPutBinding(
  namespace: KVNamespace,
  key: string,
  value: string,
  expirationTtl?: number,
): Promise<void> {
  await namespace.put(key, value, expirationTtl != null ? { expirationTtl } : undefined);
}

export async function kvGet(config: CloudflareKvConfig, key: string): Promise<string | null> {
  return getKvValue(config.accountId, config.apiToken, config.namespaceId, key);
}

export async function kvGetBinding(namespace: KVNamespace, key: string): Promise<string | null> {
  return namespace.get(key);
}

export async function kvDelete(config: CloudflareKvConfig, key: string): Promise<void> {
  await deleteKvValue(config.accountId, config.apiToken, config.namespaceId, key);
}

export async function kvMget(config: CloudflareKvConfig, keys: string[]): Promise<Array<string | null>> {
  return bulkGetKvValues(config.accountId, config.apiToken, config.namespaceId, keys);
}

export async function kvMgetBinding(
  namespace: KVNamespace,
  keys: string[],
): Promise<Array<string | null>> {
  if (keys.length === 0) return [];
  return Promise.all(keys.map((key) => namespace.get(key)));
}
