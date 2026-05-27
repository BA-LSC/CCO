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

/** Resolve classic env strings and Secrets Store bindings into WorkerEnvVars. */
export async function preloadWorkerEnvVars(
  env: Record<string, SecretsStoreSecretBinding | string | undefined>,
): Promise<WorkerEnvVars> {
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

  return vars;
}

function mirrorEnvVars(vars: WorkerEnvVars): void {
  process.env.CCO_RUNTIME = "cloudflare";
  process.env.UPLOAD_STORAGE = vars.UPLOAD_STORAGE ?? "r2";
  process.env.CF_PRESENCE_KV = "1";
  process.env.CF_DEPLOY_KV = "1";
  process.env.CF_PUSH_QUEUE_ENABLED = "1";

  for (const key of ENV_KEYS) {
    const value = vars[key];
    if (value != null && value !== "") {
      process.env[key] = value;
    }
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
  mirrorEnvVars(vars);
  return storage.run(ctx, fn);
}
