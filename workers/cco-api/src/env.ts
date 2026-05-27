import type { WorkerBindings, WorkerEnvVars } from "../../../services/api/src/runtime/worker-context";

/** Cloudflare Worker bindings + secrets for the main CCO API. */
export type CcoApiEnv = WorkerBindings &
  WorkerEnvVars & {
    /** Set by wrangler [vars] — enables R2 upload path in shared services. */
    UPLOAD_STORAGE?: string;
  };

export function workerBindings(env: CcoApiEnv): WorkerBindings {
  return {
    DB: env.DB,
    UPLOADS: env.UPLOADS,
    PRESENCE_KV: env.PRESENCE_KV,
    DEPLOY_KV: env.DEPLOY_KV,
    PUSH_QUEUE: env.PUSH_QUEUE,
    REALTIME_FANOUT: env.REALTIME_FANOUT,
  };
}

/** @deprecated Use preloadWorkerEnvVars(env) in the worker entrypoint. */
export function workerEnvVars(env: CcoApiEnv): WorkerEnvVars {
  return {
    SESSION_SECRET: env.SESSION_SECRET ?? "",
    TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY ?? "",
    CF_INTERNAL_SECRET: env.CF_INTERNAL_SECRET ?? "",
    CF_REALTIME_INTERNAL_SECRET: env.CF_REALTIME_INTERNAL_SECRET,
    WEB_URL: env.WEB_URL,
    MOBILE_ORIGIN: env.MOBILE_ORIGIN,
    PUBLIC_UPLOAD_URL: env.PUBLIC_UPLOAD_URL,
    UPLOAD_STORAGE: env.UPLOAD_STORAGE ?? "r2",
  };
}
