import Redis from "ioredis";
import {
  kvDelete,
  kvDeleteBinding,
  kvGet,
  kvGetBinding,
  kvPut,
  kvPutBinding,
  resolveDeployKvConfig,
} from "../lib/cloudflare-kv";
import { getWorkerBindings } from "../runtime/worker-context";

export const DEPLOY_DRAINING_KEY = "cco:deploy:draining";
/** KV TTL for deploy-draining flag (4 hours). */
export const DEPLOY_DRAINING_TTL_SECONDS = 4 * 60 * 60;
export const DEPLOY_SIGNAL_CHANNEL = "cco:deploy:signal";
export const DEPLOY_LAST_ERROR_KEY = "cco:deploy:last-error";
export const PLACEMENT_REDEPLOY_ERROR_KEY = "cco:deploy:placement-redeploy-error";
export const DEPLOY_PHASE_KEY = "cco:deploy:phase";

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

export async function isDeployDraining(): Promise<boolean> {
  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        return (await kvGetBinding(binding, DEPLOY_DRAINING_KEY)) === "1";
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        return (await kvGet(kv, DEPLOY_DRAINING_KEY)) === "1";
      }
    }
  } catch {
    // Fall through to Redis when KV/DB is unavailable (e.g. unit tests).
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

export async function readDeployPhase(): Promise<string | null> {
  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        const raw = await kvGetBinding(binding, DEPLOY_PHASE_KEY);
        return raw?.trim() || null;
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        const raw = await kvGet(kv, DEPLOY_PHASE_KEY);
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
    const raw = await client.get(DEPLOY_PHASE_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export async function setDeployPhase(phase: string | null): Promise<void> {
  if (!(await shouldUseKvDeploy())) {
    const client = getRedis();
    if (!client) return;
    try {
      if (client.status !== "ready") {
        await client.connect().catch(() => null);
      }
      if (client.status !== "ready") return;
      if (phase) {
        await client.set(DEPLOY_PHASE_KEY, phase, "EX", 3600);
      } else {
        await client.del(DEPLOY_PHASE_KEY);
      }
    } catch {
      // ignore
    }
    return;
  }

  const binding = getWorkerBindings()?.DEPLOY_KV;
  if (binding) {
    if (phase) {
      await kvPutBinding(binding, DEPLOY_PHASE_KEY, phase, 3600);
    } else {
      try {
        await kvDeleteBinding(binding, DEPLOY_PHASE_KEY);
      } catch {
        // ignore
      }
    }
    return;
  }
  const kv = await resolveDeployKvConfig();
  if (!kv) return;
  if (phase) {
    await kvPut(kv, DEPLOY_PHASE_KEY, phase, 3600);
  } else {
    try {
      await kvDelete(kv, DEPLOY_PHASE_KEY);
    } catch {
      // ignore
    }
  }
}

export async function setDeployDraining(updating: boolean): Promise<void> {
  const value = updating ? "1" : "0";
  if (!updating) {
    await setDeployPhase(null);
  }

  if (await shouldUseKvDeploy()) {
    const drainingTtl = updating ? DEPLOY_DRAINING_TTL_SECONDS : undefined;
    const binding = getWorkerBindings()?.DEPLOY_KV;
    if (binding) {
      await kvPutBinding(binding, DEPLOY_DRAINING_KEY, value, drainingTtl);
      await publishDeploySignal(updating);
      return;
    }
    const kv = await resolveDeployKvConfig();
    if (kv) {
      await kvPut(kv, DEPLOY_DRAINING_KEY, value, drainingTtl);
      await publishDeploySignal(updating);
      return;
    }
  }

  const client = getRedis();
  if (!client) return;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return;
    if (updating) {
      await client.set(DEPLOY_DRAINING_KEY, "1");
    } else {
      await client.del(DEPLOY_DRAINING_KEY);
    }
    await client.publish(DEPLOY_SIGNAL_CHANNEL, updating ? "updating" : "ready");
  } catch {
    // ignore deploy signal failures
  }
}

async function publishDeploySignal(updating: boolean): Promise<void> {
  if (await shouldUseKvDeploy()) {
    const binding = getWorkerBindings()?.DEPLOY_KV;
    if (binding) {
      await kvPutBinding(binding, DEPLOY_SIGNAL_CHANNEL, updating ? "updating" : "ready", 120);
      return;
    }
    const kv = await resolveDeployKvConfig();
    if (kv) {
      await kvPut(kv, DEPLOY_SIGNAL_CHANNEL, updating ? "updating" : "ready", 120);
    }
  }
}

export async function readDeployLastError(): Promise<string | null> {
  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        const raw = await kvGetBinding(binding, DEPLOY_LAST_ERROR_KEY);
        return raw?.trim() || null;
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        const raw = await kvGet(kv, DEPLOY_LAST_ERROR_KEY);
        return raw?.trim() || null;
      }
    }
  } catch {
    // ignore
  }

  const client = getRedis();
  if (!client) return null;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return null;
    const raw = await client.get(DEPLOY_LAST_ERROR_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export async function setDeployLastError(message: string | null): Promise<void> {
  if (!(await shouldUseKvDeploy())) {
    const client = getRedis();
    if (!client) return;
    try {
      if (client.status !== "ready") {
        await client.connect().catch(() => null);
      }
      if (client.status !== "ready") return;
      if (message) {
        await client.set(DEPLOY_LAST_ERROR_KEY, message, "EX", 86_400);
      } else {
        await client.del(DEPLOY_LAST_ERROR_KEY);
      }
    } catch {
      // ignore
    }
    return;
  }

  const binding = getWorkerBindings()?.DEPLOY_KV;
  if (binding) {
    if (message) {
      await kvPutBinding(binding, DEPLOY_LAST_ERROR_KEY, message, 86_400);
    } else {
      try {
        await kvDeleteBinding(binding, DEPLOY_LAST_ERROR_KEY);
      } catch (err) {
        console.warn(
          "[deploy-status] Failed to clear deploy last error from KV:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    return;
  }
  const kv = await resolveDeployKvConfig();
  if (!kv) return;
  if (message) {
    await kvPut(kv, DEPLOY_LAST_ERROR_KEY, message, 86_400);
  } else {
    try {
      await kvDelete(kv, DEPLOY_LAST_ERROR_KEY);
    } catch (err) {
      console.warn(
        "[deploy-status] Failed to clear deploy last error from KV:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function readPlacementRedeployError(): Promise<string | null> {
  try {
    if (await shouldUseKvDeploy()) {
      const binding = getWorkerBindings()?.DEPLOY_KV;
      if (binding) {
        const raw = await kvGetBinding(binding, PLACEMENT_REDEPLOY_ERROR_KEY);
        return raw?.trim() || null;
      }
      const kv = await resolveDeployKvConfig();
      if (kv) {
        const raw = await kvGet(kv, PLACEMENT_REDEPLOY_ERROR_KEY);
        return raw?.trim() || null;
      }
    }
  } catch {
    // ignore
  }

  const client = getRedis();
  if (!client) return null;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return null;
    const raw = await client.get(PLACEMENT_REDEPLOY_ERROR_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export async function setPlacementRedeployError(message: string | null): Promise<void> {
  if (!(await shouldUseKvDeploy())) {
    const client = getRedis();
    if (!client) return;
    try {
      if (client.status !== "ready") {
        await client.connect().catch(() => null);
      }
      if (client.status !== "ready") return;
      if (message) {
        await client.set(PLACEMENT_REDEPLOY_ERROR_KEY, message, "EX", 86_400);
      } else {
        await client.del(PLACEMENT_REDEPLOY_ERROR_KEY);
      }
    } catch {
      // ignore
    }
    return;
  }

  const binding = getWorkerBindings()?.DEPLOY_KV;
  if (binding) {
    if (message) {
      await kvPutBinding(binding, PLACEMENT_REDEPLOY_ERROR_KEY, message, 86_400);
    } else {
      try {
        await kvDeleteBinding(binding, PLACEMENT_REDEPLOY_ERROR_KEY);
      } catch {
        // ignore
      }
    }
    return;
  }
  const kv = await resolveDeployKvConfig();
  if (!kv) return;
  if (message) {
    await kvPut(kv, PLACEMENT_REDEPLOY_ERROR_KEY, message, 86_400);
  } else {
    try {
      await kvDelete(kv, PLACEMENT_REDEPLOY_ERROR_KEY);
    } catch {
      // ignore
    }
  }
}

export async function clearPlacementRedeployError(): Promise<void> {
  await setPlacementRedeployError(null);
}

export async function readDeploySignal(): Promise<boolean> {
  if (await shouldUseKvDeploy()) {
    const binding = getWorkerBindings()?.DEPLOY_KV;
    if (binding) {
      const raw = await kvGetBinding(binding, DEPLOY_SIGNAL_CHANNEL);
      if (raw === "updating") return true;
      if (raw === "ready") return false;
    }
    const kv = await resolveDeployKvConfig();
    if (kv) {
      const raw = await kvGet(kv, DEPLOY_SIGNAL_CHANNEL);
      if (raw === "updating") return true;
      if (raw === "ready") return false;
    }
  }
  return isDeployDraining();
}
