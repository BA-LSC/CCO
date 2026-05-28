import Redis from "ioredis";
import {
  kvDelete,
  kvDeleteBinding,
  kvGet,
  kvGetBinding,
  kvPut,
  kvPutBinding,
  resolveDeployKvConfig,
} from "./cloudflare-kv";
import { getWorkerBindings } from "../runtime/worker-context";

/** Short-lived OAuth login group-sync error (5 minutes). */
export const OAUTH_SYNC_ERROR_TTL_SECONDS = 5 * 60;

export function oauthSyncErrorKey(userId: string): string {
  return `cco:oauth:sync-error:${userId}`;
}

let redis: Redis | null = null;

function getRedis(): Redis | null {
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

async function shouldUseKvDeploy(): Promise<boolean> {
  if (getWorkerBindings()?.DEPLOY_KV) return true;
  if (process.env.CF_DEPLOY_KV === "1") return true;
  if (process.env.REDIS_URL) return false;
  try {
    return Boolean(await resolveDeployKvConfig());
  } catch {
    return false;
  }
}

export async function setOAuthSyncError(userId: string, message: string): Promise<void> {
  const key = oauthSyncErrorKey(userId);
  const value = message.trim();
  if (!value) return;

  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        await kvPutBinding(binding, key, value, OAUTH_SYNC_ERROR_TTL_SECONDS);
        return;
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        await kvPut(kv, key, value, OAUTH_SYNC_ERROR_TTL_SECONDS);
        return;
      }
    }
  } catch {
    // Fall through to Redis when KV is unavailable.
  }

  const client = getRedis();
  if (!client) return;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return;
    await client.set(key, value, "EX", OAUTH_SYNC_ERROR_TTL_SECONDS);
  } catch {
    // ignore
  }
}

export async function readOAuthSyncError(userId: string): Promise<string | null> {
  const key = oauthSyncErrorKey(userId);

  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        const raw = await kvGetBinding(binding, key);
        return raw?.trim() || null;
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        const raw = await kvGet(kv, key);
        return raw?.trim() || null;
      }
    }
  } catch {
    // Fall through to Redis when KV is unavailable.
  }

  const client = getRedis();
  if (!client) return null;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return null;
    const raw = await client.get(key);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export async function clearOAuthSyncError(userId: string): Promise<void> {
  const key = oauthSyncErrorKey(userId);

  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        await kvDeleteBinding(binding, key);
        return;
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        await kvDelete(kv, key);
        return;
      }
    }
  } catch {
    // Fall through to Redis when KV is unavailable.
  }

  const client = getRedis();
  if (!client) return;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return;
    await client.del(key);
  } catch {
    // ignore
  }
}
