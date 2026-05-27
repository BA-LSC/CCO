import { verifyCloudflareApiToken } from "./cloudflare-api";

export type ProvisionStep =
  | "verify_token"
  | "create_d1"
  | "migrate_d1"
  | "create_r2"
  | "create_kv"
  | "create_queue"
  | "deploy_workers"
  | "deploy_pages"
  | "configure_dns"
  | "configure_routes"
  | "provision_realtimekit"
  | "configure_cache_rules"
  | "finalize_org"
  | "complete";

export const PROVISION_STEP_ORDER: readonly ProvisionStep[] = [
  "verify_token",
  "create_d1",
  "migrate_d1",
  "create_r2",
  "create_kv",
  "create_queue",
  "deploy_workers",
  "deploy_pages",
  "configure_dns",
  "configure_routes",
  "provision_realtimekit",
  "configure_cache_rules",
  "finalize_org",
  "complete",
] as const;

export type ProvisionStepStatus = "pending" | "running" | "complete" | "failed";

export type ProvisionSecrets = {
  SESSION_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  CF_INTERNAL_SECRET: string;
};

export type ProvisionResources = {
  accountId?: string;
  zoneId?: string;
  d1DatabaseId?: string;
  r2BucketName?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  kvPresenceNamespaceId?: string;
  kvDeployNamespaceId?: string;
  pushQueueId?: string;
  chatHostname?: string;
  apiHostname?: string;
  workerScriptNames?: string[];
  pagesProjectName?: string;
  webWorkerScriptName?: string;
  realtimeKitAppId?: string;
  realtimeKitPresetHost?: string;
  realtimeKitPresetMember?: string;
  realtimeKitPresetGuest?: string;
};

export type ProvisionSessionState = {
  churchName: string;
  currentStep: ProvisionStep;
  stepStatus: Record<ProvisionStep, { status: ProvisionStepStatus; error?: string; completedAt?: number }>;
  secrets?: ProvisionSecrets;
  resources: ProvisionResources;
  startedAt: number;
  updatedAt: number;
  error?: string;
};

export type ProvisionSessionStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/** In-memory store for local migration scripts and tests. */
export function createMemoryProvisionStore(): ProvisionSessionStore {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    put: async (key, value) => {
      map.set(key, value);
    },
  };
}

export type ProvisionPipelineContext = {
  apiToken: string;
  accountId?: string;
  zoneId?: string;
  chatHostname?: string;
  apiHostname?: string;
  d1MigrationSqlFiles?: string[];
};

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateProvisionSecrets(): ProvisionSecrets {
  return {
    SESSION_SECRET: randomBase64Url(32),
    TOKEN_ENCRYPTION_KEY: randomBase64Url(32),
    CF_INTERNAL_SECRET: randomBase64Url(32),
  };
}

export function createInitialProvisionState(churchName: string): ProvisionSessionState {
  const now = Date.now();
  const stepStatus = Object.fromEntries(
    PROVISION_STEP_ORDER.map((step) => [step, { status: "pending" as const }]),
  ) as ProvisionSessionState["stepStatus"];

  return {
    churchName,
    currentStep: "verify_token",
    stepStatus,
    resources: {},
    startedAt: now,
    updatedAt: now,
  };
}

export function provisionSessionKey(sessionId: string): string {
  return `provision:${sessionId}`;
}

export async function loadProvisionState(
  store: ProvisionSessionStore,
  sessionId: string,
): Promise<ProvisionSessionState | null> {
  const raw = await store.get(provisionSessionKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as ProvisionSessionState;
}

export async function persistProvisionState(
  store: ProvisionSessionStore,
  sessionId: string,
  state: ProvisionSessionState,
  options?: { expirationTtl?: number },
): Promise<void> {
  state.updatedAt = Date.now();
  await store.put(provisionSessionKey(sessionId), JSON.stringify(state), options);
}

async function markStepRunning(
  store: ProvisionSessionStore,
  sessionId: string,
  state: ProvisionSessionState,
  step: ProvisionStep,
): Promise<void> {
  state.currentStep = step;
  state.stepStatus[step] = { status: "running" };
  await persistProvisionState(store, sessionId, state);
}

async function markStepComplete(
  store: ProvisionSessionStore,
  sessionId: string,
  state: ProvisionSessionState,
  step: ProvisionStep,
): Promise<void> {
  state.stepStatus[step] = { status: "complete", completedAt: Date.now() };
  await persistProvisionState(store, sessionId, state);
}

async function markStepFailed(
  store: ProvisionSessionStore,
  sessionId: string,
  state: ProvisionSessionState,
  step: ProvisionStep,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  state.stepStatus[step] = { status: "failed", error: message };
  state.error = message;
  await persistProvisionState(store, sessionId, state);
}

export type ProvisionStepHandler = (
  state: ProvisionSessionState,
  context: ProvisionPipelineContext,
) => Promise<void>;

export type ProvisionStepHandlers = Partial<Record<ProvisionStep, ProvisionStepHandler>>;

const defaultVerifyTokenStep: ProvisionStepHandler = async (_state, context) => {
  const verified = await verifyCloudflareApiToken(context.apiToken);
  if (verified.status !== "active") {
    throw new Error("Cloudflare API token is not active");
  }
};

/**
 * Runs the BYO Cloudflare install provision pipeline sequentially.
 * Each step updates persisted session state; failures stop the pipeline.
 */
export async function runProvisionPipeline(
  sessionId: string,
  store: ProvisionSessionStore,
  context: ProvisionPipelineContext,
  handlers: ProvisionStepHandlers = {},
): Promise<ProvisionSessionState> {
  let state =
    (await loadProvisionState(store, sessionId)) ??
    createInitialProvisionState("");

  if (!state.secrets) {
    state.secrets = generateProvisionSecrets();
    await persistProvisionState(store, sessionId, state);
  }

  const stepsToRun = PROVISION_STEP_ORDER.filter((step) => step !== "complete");

  for (const step of stepsToRun) {
    if (state.stepStatus[step]?.status === "complete") {
      continue;
    }

    await markStepRunning(store, sessionId, state, step);

    try {
      const handler = handlers[step] ?? (step === "verify_token" ? defaultVerifyTokenStep : undefined);
      if (handler) {
        await handler(state, context);
      }
      await markStepComplete(store, sessionId, state, step);
    } catch (err) {
      await markStepFailed(store, sessionId, state, step, err);
      throw err;
    }
  }

  state.currentStep = "complete";
  state.stepStatus.complete = { status: "complete", completedAt: Date.now() };
  await persistProvisionState(store, sessionId, state);
  return state;
}
