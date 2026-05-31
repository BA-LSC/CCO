import { AsyncLocalStorage } from "node:async_hooks";
import { createD1Client, type CcoD1Database } from "@cco/db";

/** Cloudflare Secrets Store binding (Workers runtime). */
export type SecretsStoreSecretBinding = {
  get(): Promise<string>;
};

/** Cloudflare Worker bindings available to the API runtime. */
export type WorkerBindings = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  PRESENCE_KV: KVNamespace;
  DEPLOY_KV: KVNamespace;
  PUSH_QUEUE: Queue<unknown>;
  REALTIME_FANOUT: Fetcher;
};

/** Secrets and vars injected into the worker (also mirrored to process.env). */
export type WorkerEnvVars = {
  SESSION_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  CF_INTERNAL_SECRET: string;
  CF_REALTIME_INTERNAL_SECRET?: string;
  WEB_URL?: string;
  MOBILE_ORIGIN?: string;
  PUBLIC_UPLOAD_URL?: string;
  UPLOAD_STORAGE?: string;
  PCO_CLIENT_SECRET?: string;
  WEBHOOK_SECRETS?: string;
  GIPHY_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  VAPID_PRIVATE_KEY?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  SETUP_BOOTSTRAP_SECRET?: string;
};

/** Cloudflare ExecutionContext surface used for background deploy jobs. */
export type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type WorkerRuntimeContext = {
  bindings: WorkerBindings;
  vars: WorkerEnvVars;
  d1: CcoD1Database;
  executionCtx?: WorkerExecutionContext;
};

const storage = new AsyncLocalStorage<WorkerRuntimeContext>();

export function getWorkerContext(): WorkerRuntimeContext | undefined {
  return storage.getStore();
}

export function getWorkerBindings(): WorkerBindings | undefined {
  return storage.getStore()?.bindings;
}

export function getWorkerD1(): CcoD1Database | undefined {
  return storage.getStore()?.d1;
}

export function getExecutionContext(): WorkerExecutionContext | undefined {
  return storage.getStore()?.executionCtx;
}

export function isCloudflareRuntime(): boolean {
  return storage.getStore() != null || process.env.CCO_RUNTIME === "cloudflare";
}

/** True when handling a request inside the Cloudflare Worker isolate. */
export function isCloudflareWorkerRuntime(): boolean {
  return storage.getStore() != null;
}

/** Run work after the response via waitUntil when on Workers; otherwise fire-and-forget. */
export function scheduleBackgroundWork(fn: () => void | Promise<void>): void {
  const work = Promise.resolve().then(fn);
  const executionCtx = getExecutionContext();
  if (executionCtx) {
    executionCtx.waitUntil(work);
    return;
  }
  void work.catch((err) => {
    console.warn(
      "[worker-context] Background work failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

const ENV_KEYS: Array<keyof WorkerEnvVars> = [
  "SESSION_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "CF_INTERNAL_SECRET",
  "CF_REALTIME_INTERNAL_SECRET",
  "WEB_URL",
  "MOBILE_ORIGIN",
  "PUBLIC_UPLOAD_URL",
  "UPLOAD_STORAGE",
  "PCO_CLIENT_SECRET",
  "WEBHOOK_SECRETS",
  "GIPHY_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "VAPID_PRIVATE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SETUP_BOOTSTRAP_SECRET",
];

async function resolveBindingValue(
  value: SecretsStoreSecretBinding | string | undefined,
): Promise<string | undefined> {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  const resolved = (await value.get())?.trim();
  return resolved || undefined;
}

const PRELOADED_ENV_CACHE_TTL_MS = 5 * 60 * 1000;

type PreloadedEnvCacheEntry = {
  vars: WorkerEnvVars;
  expiresAt: number;
};

let preloadedEnvCache: PreloadedEnvCacheEntry | null = null;

/** Resolve classic env strings and Secrets Store bindings into WorkerEnvVars. */
export async function preloadWorkerEnvVars(
  env: Record<string, SecretsStoreSecretBinding | string | undefined>,
): Promise<WorkerEnvVars> {
  const now = Date.now();
  if (preloadedEnvCache && preloadedEnvCache.expiresAt > now) {
    return preloadedEnvCache.vars;
  }

  const entries = await Promise.all(
    ENV_KEYS.map(async (key) => [key, await resolveBindingValue(env[key])] as const),
  );

  const vars: WorkerEnvVars = {
    SESSION_SECRET: "",
    TOKEN_ENCRYPTION_KEY: "",
    CF_INTERNAL_SECRET: "",
  };

  for (const [key, value] of entries) {
    if (value != null && value !== "") {
      vars[key] = value;
    }
  }

  if (!vars.SETUP_BOOTSTRAP_SECRET && vars.CF_INTERNAL_SECRET) {
    vars.SETUP_BOOTSTRAP_SECRET = vars.CF_INTERNAL_SECRET;
  }

  preloadedEnvCache = { vars, expiresAt: now + PRELOADED_ENV_CACHE_TTL_MS };
  return vars;
}

/** Read a worker var from AsyncLocalStorage first, then process.env. */
export function getWorkerEnvVar<K extends keyof WorkerEnvVars>(
  key: K,
): WorkerEnvVars[K] | undefined {
  const fromContext = storage.getStore()?.vars[key];
  if (fromContext != null && fromContext !== "") return fromContext;
  const fromEnv = process.env[key];
  return fromEnv != null && fromEnv !== "" ? (fromEnv as WorkerEnvVars[K]) : undefined;
}

const MIRRORED_ENV_KEYS: Array<keyof WorkerEnvVars> = [
  "SESSION_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "CF_INTERNAL_SECRET",
  "CF_REALTIME_INTERNAL_SECRET",
  "WEB_URL",
  "MOBILE_ORIGIN",
  "PUBLIC_UPLOAD_URL",
  "UPLOAD_STORAGE",
  "PCO_CLIENT_SECRET",
  "WEBHOOK_SECRETS",
  "GIPHY_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "VAPID_PRIVATE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SETUP_BOOTSTRAP_SECRET",
];

function mirrorEnvVars(vars: WorkerEnvVars): void {
  process.env.CCO_RUNTIME = "cloudflare";
  process.env.UPLOAD_STORAGE = vars.UPLOAD_STORAGE ?? "r2";
  process.env.CF_PRESENCE_KV = "1";
  process.env.CF_DEPLOY_KV = "1";
  process.env.CF_PUSH_QUEUE_ENABLED = "1";

  for (const key of MIRRORED_ENV_KEYS) {
    const value = vars[key];
    if (value != null && value !== "") {
      process.env[key] = value;
    }
  }
}

const MIRRORED_RUNTIME_ENV_KEYS = [
  "CCO_RUNTIME",
  "UPLOAD_STORAGE",
  "CF_PRESENCE_KV",
  "CF_DEPLOY_KV",
  "CF_PUSH_QUEUE_ENABLED",
  ...MIRRORED_ENV_KEYS,
] as const;

function snapshotProcessEnv(keys: readonly string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreProcessEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Run a handler with D1, R2, KV, Queue, and service bindings active. */
export async function runWithWorkerContext<T>(
  bindings: WorkerBindings,
  vars: WorkerEnvVars,
  fn: () => T | Promise<T>,
  executionCtx?: WorkerExecutionContext,
): Promise<T> {
  const d1 = createD1Client(bindings.DB);
  const ctx: WorkerRuntimeContext = { bindings, vars, d1, executionCtx };
  const envSnapshot = snapshotProcessEnv(MIRRORED_RUNTIME_ENV_KEYS);
  mirrorEnvVars(vars);
  try {
    return await storage.run(ctx, fn);
  } finally {
    restoreProcessEnv(envSnapshot);
  }
}
