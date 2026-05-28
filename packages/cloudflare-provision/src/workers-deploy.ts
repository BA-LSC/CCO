import { CloudflareApiError, parseCloudflareJsonText, readCloudflareJson } from "./cloudflare-api";
import { ensureWorkerRoute } from "./cloudflare-api-resources";
import type { ProvisionResources } from "./provision-pipeline";
import { buildWorkerSecretsStoreBindings } from "./secrets-store";
import {
  buildWorkerBindings,
  CCO_API_WORKER_ROUTES,
  CCO_RECONCILE_WORKER_CRONS,
  CCO_WORKER_BUILD_SPECS,
  resolveApiRoutePattern,
  type CcoWorkerScriptName,
} from "./worker-definitions";

const CF_API = "https://api.cloudflare.com/client/v4";

/** Keep in sync with wrangler.jsonc compatibility_date across CCO workers. */
export const CCO_WORKER_COMPATIBILITY_DATE = "2026-05-28";

/** Required for cco-api / realtime bundles that import node:* built-ins (postgres, crypto, etc.). */
export const CCO_WORKER_NODEJS_COMPAT_FLAGS = ["nodejs_compat"] as const;

export type WorkerBinding =
  | { type: "d1"; name: string; id: string }
  | { type: "r2_bucket"; name: string; bucket_name: string }
  | { type: "kv_namespace"; name: string; namespace_id: string }
  | { type: "queue"; name: string; queue_name: string }
  | { type: "plain_text"; name: string; text: string }
  | { type: "service"; name: string; service: string }
  | { type: "assets"; name: string }
  | {
      type: "durable_object_namespace";
      name: string;
      class_name: string;
      script_name?: string;
    }
  | {
      type: "secrets_store_secret";
      name: string;
      store_id: string;
      secret_name: string;
    };

type WorkerScriptMetadata = {
  main_module: string;
  bindings: WorkerBinding[];
  compatibility_date: string;
  compatibility_flags?: string[];
  migrations?: {
    new_tag: string;
    steps: Array<{
      new_classes?: string[];
      new_sqlite_classes?: string[];
      deleted_classes?: string[];
    }>;
  };
};

async function readWorkerDeployResponse(res: Response): Promise<void> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      throw new CloudflareApiError(`Worker deploy failed (${res.status})`, res.status);
    }
    return;
  }
  // Successful script uploads may echo the module bundle as multipart instead of JSON.
  if (res.ok && text.trimStart().startsWith("--")) {
    return;
  }

  const parsed = parseCloudflareJsonText(text, res.status);
  if (parsed === null) {
    if (!res.ok) {
      throw new CloudflareApiError(`Worker deploy failed (${res.status})`, res.status);
    }
    return;
  }

  const json = parsed as { success?: boolean; errors?: Array<{ message: string }> };
  if (!res.ok || json.success === false) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new CloudflareApiError(detail || "Worker deploy failed", res.status);
  }
}

export type DeployWorkerScriptOptions = {
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  migrations?: WorkerScriptMetadata["migrations"];
};

export async function deployWorkerScript(
  accountId: string,
  apiToken: string,
  scriptName: string,
  moduleBytes: ArrayBuffer,
  bindings: WorkerBinding[],
  options?: DeployWorkerScriptOptions,
): Promise<void> {
  const moduleFileName = `${scriptName}.mjs`;
  const metadata: WorkerScriptMetadata = {
    main_module: moduleFileName,
    bindings,
    compatibility_date: options?.compatibilityDate ?? CCO_WORKER_COMPATIBILITY_DATE,
  };
  if (options?.compatibilityFlags?.length) {
    metadata.compatibility_flags = [...options.compatibilityFlags];
  }
  if (options?.migrations) {
    metadata.migrations = options.migrations;
  }

  const form = new FormData();
  // Multipart metadata must be a file part with application/json (plain strings drop compatibility_flags).
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  form.append(moduleFileName, new Blob([moduleBytes], { type: "application/javascript+module" }), moduleFileName);

  const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiToken}` },
    body: form,
  });

  await readWorkerDeployResponse(res);

  if (options?.compatibilityFlags?.length) {
    await assertWorkerScriptCompatibility(
      accountId,
      apiToken,
      scriptName,
      options.compatibilityFlags,
      options.compatibilityDate ?? CCO_WORKER_COMPATIBILITY_DATE,
    );
  }
}

async function fetchWorkerScriptSettings(
  accountId: string,
  apiToken: string,
  scriptName: string,
): Promise<{ compatibility_flags?: string[]; compatibility_date?: string } | null> {
  const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const parsed = await readCloudflareJson(res);
  const json = parsed as {
    success?: boolean;
    result?: Array<{
      id: string;
      compatibility_flags?: string[];
      compatibility_date?: string;
    }>;
    errors?: Array<{ message: string }>;
  };
  if (!res.ok || json.success === false) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new CloudflareApiError(
      detail || `Failed to list worker scripts for ${scriptName}`,
      res.status,
    );
  }
  return json.result?.find((script) => script.id === scriptName) ?? null;
}

async function assertWorkerScriptCompatibility(
  accountId: string,
  apiToken: string,
  scriptName: string,
  expectedFlags: readonly string[],
  expectedDate: string,
): Promise<void> {
  const settings = await fetchWorkerScriptSettings(accountId, apiToken, scriptName);
  if (!settings) {
    throw new CloudflareApiError(`Worker ${scriptName} not found after deploy`, 404);
  }

  const flags = settings.compatibility_flags ?? [];
  const missingFlags = expectedFlags.filter((flag) => !flags.includes(flag));
  if (missingFlags.length > 0) {
    throw new CloudflareApiError(
      `Worker ${scriptName} deploy did not apply compatibility flags: ${missingFlags.join(", ")}`,
      500,
    );
  }

  if (settings.compatibility_date && settings.compatibility_date !== expectedDate) {
    throw new CloudflareApiError(
      `Worker ${scriptName} compatibility_date is ${settings.compatibility_date}, expected ${expectedDate}`,
      500,
    );
  }
}

export async function putWorkerSecret(
  accountId: string,
  apiToken: string,
  scriptName: string,
  name: string,
  value: string,
): Promise<void> {
  const res = await fetch(
    `${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, text: value, type: "secret_text" }),
    },
  );

  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      throw new CloudflareApiError(`Worker secret upload failed (${res.status})`, res.status);
    }
    return;
  }

  const parsed = parseCloudflareJsonText(text, res.status);
  if (parsed === null) return;

  const json = parsed as {
    success?: boolean;
    errors?: Array<{ message: string }>;
  };
  if (!res.ok || json.success === false) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new CloudflareApiError(detail || "Worker secret upload failed", res.status);
  }
}

export async function deployWorkerCronSchedule(
  accountId: string,
  apiToken: string,
  scriptName: string,
  cron: string | readonly string[],
): Promise<void> {
  const schedules = (Array.isArray(cron) ? cron : [cron]).map((entry) => ({ cron: entry }));
  const res = await fetch(
    `${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}/schedules`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(schedules),
    },
  );
  await readWorkerDeployResponse(res);
}

export async function ensureQueueConsumer(
  accountId: string,
  apiToken: string,
  queueId: string,
  scriptName: string,
  settings?: { batchSize?: number; maxWaitTimeMs?: number; maxRetries?: number },
): Promise<void> {
  const res = await fetch(`${CF_API}/accounts/${accountId}/queues/${queueId}/consumers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "worker",
      script_name: scriptName,
      settings: {
        batch_size: settings?.batchSize ?? 10,
        max_wait_time_ms: settings?.maxWaitTimeMs ?? 5000,
        max_retries: settings?.maxRetries ?? 3,
      },
    }),
  });

  const text = await res.text();
  if (res.status === 409) {
    return;
  }
  if (!text.trim()) {
    if (!res.ok) {
      throw new CloudflareApiError(`Queue consumer setup failed (${res.status})`, res.status);
    }
    return;
  }
  const parsed = parseCloudflareJsonText(text, res.status);
  if (parsed === null) return;

  const json = parsed as { success?: boolean; errors?: Array<{ message: string }> };
  if (!res.ok || json.success === false) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    if (/already has a consumer/i.test(detail)) {
      return;
    }
    throw new CloudflareApiError(detail || "Queue consumer setup failed", res.status);
  }
}

export type DeployAllProvisionWorkersParams = {
  accountId: string;
  apiToken: string;
  resources: ProvisionResources;
  secretsStoreId: string;
  apiHostname: string;
  readBundle: (scriptName: CcoWorkerScriptName) => Promise<ArrayBuffer>;
};

function workerDeployOptions(scriptName: CcoWorkerScriptName): DeployWorkerScriptOptions {
  if (scriptName === "cco-api" || scriptName === "cco-realtime-fanout") {
    return {
      compatibilityDate: CCO_WORKER_COMPATIBILITY_DATE,
      compatibilityFlags: [...CCO_WORKER_NODEJS_COMPAT_FLAGS],
      ...(scriptName === "cco-realtime-fanout"
        ? {
            migrations: {
              new_tag: "v1",
              steps: [{ new_sqlite_classes: ["ConversationRoom"] }],
            },
          }
        : {}),
    };
  }
  return { compatibilityDate: CCO_WORKER_COMPATIBILITY_DATE };
}

async function listWorkerMigrationTags(
  accountId: string,
  apiToken: string,
): Promise<Map<string, string>> {
  const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (res.status === 404) {
    return new Map<string, string>();
  }

  const parsed = await readCloudflareJson(res);
  const json = parsed as {
    success?: boolean;
    result?: Array<{ id: string; migration_tag?: string }>;
    errors?: Array<{ message: string; code?: number }>;
  };
  if (!res.ok || json.success === false) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    if (res.status === 403 || /authentication error/i.test(detail)) {
      throw new CloudflareApiError(detail || "Failed to list worker scripts", res.status);
    }
    return new Map<string, string>();
  }
  const tags = new Map<string, string>();
  for (const script of json.result ?? []) {
    if (script.migration_tag) {
      tags.set(script.id, script.migration_tag);
    }
  }
  return tags;
}

function resolveWorkerDeployOptions(
  scriptName: CcoWorkerScriptName,
  existingMigrationTag?: string,
): DeployWorkerScriptOptions {
  const options = workerDeployOptions(scriptName);
  if (scriptName === "cco-realtime-fanout" && existingMigrationTag) {
    const { migrations: _migrations, ...rest } = options;
    return rest;
  }
  return options;
}

export async function deployAllProvisionWorkers(
  params: DeployAllProvisionWorkersParams,
): Promise<string[]> {
  const { accountId, apiToken, resources, secretsStoreId, apiHostname, readBundle } = params;

  if (!apiHostname.trim()) {
    throw new Error("apiHostname is required to deploy workers");
  }
  if (!secretsStoreId.trim()) {
    throw new Error("secretsStoreId is required to deploy BYO workers");
  }

  const bindingParams = {
    resources,
    apiHostname,
    chatHostname: resources.chatHostname,
  };
  const deployed: string[] = [];
  const migrationTags = await listWorkerMigrationTags(accountId, apiToken);

  for (const spec of CCO_WORKER_BUILD_SPECS) {
    const moduleBytes = await readBundle(spec.scriptName);
    const bindings = [
      ...buildWorkerBindings(spec.scriptName, bindingParams),
      ...buildWorkerSecretsStoreBindings(spec.scriptName, secretsStoreId),
    ];

    await deployWorkerScript(
      accountId,
      apiToken,
      spec.scriptName,
      moduleBytes,
      bindings,
      resolveWorkerDeployOptions(spec.scriptName, migrationTags.get(spec.scriptName)),
    );

    if (spec.scriptName === "cco-reconcile-cron") {
      await deployWorkerCronSchedule(
        accountId,
        apiToken,
        spec.scriptName,
        CCO_RECONCILE_WORKER_CRONS,
      );
    }

    if (spec.scriptName === "cco-push-consumer" && resources.pushQueueId) {
      await ensureQueueConsumer(accountId, apiToken, resources.pushQueueId, spec.scriptName);
    }

    deployed.push(spec.scriptName);
  }

  return deployed;
}

export type EnsureCcoApiWorkerRoutesResult = Array<{
  pattern: string;
  script: string;
  created: boolean;
}>;

export async function ensureCcoApiWorkerRoutes(
  zoneId: string,
  apiToken: string,
  apiHostname: string,
): Promise<EnsureCcoApiWorkerRoutesResult> {
  const host = apiHostname.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!host) {
    throw new Error("apiHostname is required to configure worker routes");
  }

  const results: EnsureCcoApiWorkerRoutesResult = [];
  for (const route of CCO_API_WORKER_ROUTES) {
    const pattern = resolveApiRoutePattern(host, route.patternSuffix);
    const ensured = await ensureWorkerRoute(zoneId, apiToken, pattern, route.script);
    results.push({ pattern, script: route.script, created: ensured.created });
  }
  return results;
}
