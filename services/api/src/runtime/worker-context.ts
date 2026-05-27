import { AsyncLocalStorage } from "node:async_hooks";
import { createD1Client, type CcoD1Database } from "@cco/db";

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
};

export type WorkerRuntimeContext = {
  bindings: WorkerBindings;
  vars: WorkerEnvVars;
  d1: CcoD1Database;
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
];

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
): Promise<T> {
  const d1 = createD1Client(bindings.DB);
  const ctx: WorkerRuntimeContext = { bindings, vars, d1 };
  mirrorEnvVars(vars);
  return storage.run(ctx, fn);
}
