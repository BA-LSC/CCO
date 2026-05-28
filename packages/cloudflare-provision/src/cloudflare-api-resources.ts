import { cfRequest, CloudflareApiError } from "./cloudflare-api";

export type R2Bucket = {
  name: string;
  creation_date?: string;
};

type R2BucketsListResult = { buckets?: R2Bucket[] };

export async function listR2Buckets(accountId: string, apiToken: string): Promise<R2Bucket[]> {
  try {
    const result = await cfRequest<R2Bucket[] | R2BucketsListResult>(
      apiToken,
      `/accounts/${accountId}/r2/buckets`,
    );
    if (Array.isArray(result)) return result;
    return result.buckets ?? [];
  } catch {
    return [];
  }
}

export async function createR2Bucket(
  accountId: string,
  apiToken: string,
  name: string,
): Promise<R2Bucket> {
  return cfRequest<R2Bucket>(apiToken, `/accounts/${accountId}/r2/buckets`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function ensureR2Bucket(
  accountId: string,
  apiToken: string,
  name: string,
): Promise<{ name: string; created: boolean }> {
  const existing = await listR2Buckets(accountId, apiToken);
  if (existing.some((bucket) => bucket.name === name)) {
    return { name, created: false };
  }
  await createR2Bucket(accountId, apiToken, name);
  return { name, created: true };
}

type R2AccessKeyResponse = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
};

export type R2AccessKey = {
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
};

export async function createR2AccessKey(
  accountId: string,
  apiToken: string,
  bucketName: string,
  parentAccessKeyId: string,
): Promise<R2AccessKey> {
  const result = await cfRequest<R2AccessKeyResponse>(
    apiToken,
    `/accounts/${accountId}/r2/temp-access-credentials`,
    {
      method: "POST",
      body: JSON.stringify({
        bucket: bucketName,
        parentAccessKeyId,
        permission: "object-read-write",
        ttlSeconds: 604800,
      }),
    },
  );

  const accessKeyId = result.accessKeyId?.trim();
  const secretAccessKey = result.secretAccessKey?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 temp access credentials response missing access keys");
  }

  return {
    access_key_id: accessKeyId,
    secret_access_key: secretAccessKey,
    session_token: result.sessionToken?.trim() || undefined,
  };
}

export type KvNamespace = {
  id: string;
  title: string;
};

export async function listKvNamespaces(accountId: string, apiToken: string): Promise<KvNamespace[]> {
  const result = await cfRequest<Array<KvNamespace>>(
    apiToken,
    `/accounts/${accountId}/storage/kv/namespaces`,
  );
  return result ?? [];
}

export async function createKvNamespace(
  accountId: string,
  apiToken: string,
  title: string,
): Promise<KvNamespace> {
  return cfRequest<KvNamespace>(apiToken, `/accounts/${accountId}/storage/kv/namespaces`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function ensureKvNamespace(
  accountId: string,
  apiToken: string,
  title: string,
): Promise<{ id: string; title: string; created: boolean }> {
  const existing = await listKvNamespaces(accountId, apiToken);
  const match = existing.find((ns) => ns.title === title);
  if (match) return { ...match, created: false };
  const created = await createKvNamespace(accountId, apiToken, title);
  return { ...created, created: true };
}

export type CfQueue = {
  queue_id: string;
  queue_name: string;
};

export async function listQueues(accountId: string, apiToken: string): Promise<CfQueue[]> {
  try {
    const result = await cfRequest<CfQueue[] | { queues?: CfQueue[] }>(
      apiToken,
      `/accounts/${accountId}/queues`,
    );
    if (Array.isArray(result)) return result;
    return result.queues ?? [];
  } catch {
    return [];
  }
}

export async function createQueue(
  accountId: string,
  apiToken: string,
  queueName: string,
): Promise<CfQueue> {
  return cfRequest<CfQueue>(apiToken, `/accounts/${accountId}/queues`, {
    method: "POST",
    body: JSON.stringify({ queue_name: queueName }),
  });
}

export async function ensureQueue(
  accountId: string,
  apiToken: string,
  queueName: string,
): Promise<{ queue_id: string; queue_name: string; created: boolean }> {
  const existing = await listQueues(accountId, apiToken);
  const match = existing.find((q) => q.queue_name === queueName);
  if (match) return { ...match, created: false };
  try {
    const created = await createQueue(accountId, apiToken, queueName);
    return { ...created, created: true };
  } catch (err) {
    if (err instanceof CloudflareApiError && err.status === 409) {
      const retry = await listQueues(accountId, apiToken);
      const existingMatch = retry.find((q) => q.queue_name === queueName);
      if (existingMatch) return { ...existingMatch, created: false };
    }
    throw err;
  }
}

/** Ensures the push notification queue and its dead-letter queue exist. */
export async function ensurePushNotificationQueues(
  accountId: string,
  apiToken: string,
  queueName: string,
  dlqName: string,
): Promise<{ pushQueueId: string; dlqQueueId: string }> {
  const [pushQueue, dlqQueue] = await Promise.all([
    ensureQueue(accountId, apiToken, queueName),
    ensureQueue(accountId, apiToken, dlqName),
  ]);
  return { pushQueueId: pushQueue.queue_id, dlqQueueId: dlqQueue.queue_id };
}

export type HyperdriveConfig = {
  id: string;
  name: string;
};

export async function listHyperdriveConfigs(
  accountId: string,
  apiToken: string,
): Promise<HyperdriveConfig[]> {
  try {
    return await cfRequest<HyperdriveConfig[]>(apiToken, `/accounts/${accountId}/hyperdrive/configs`);
  } catch {
    return [];
  }
}

export async function createHyperdriveConfig(
  accountId: string,
  apiToken: string,
  params: { name: string; originConnectionString: string },
): Promise<HyperdriveConfig> {
  const origin = parsePostgresUrl(params.originConnectionString);
  return cfRequest<HyperdriveConfig>(apiToken, `/accounts/${accountId}/hyperdrive/configs`, {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      origin: {
        host: origin.host,
        port: origin.port,
        database: origin.database,
        user: origin.user,
        password: origin.password,
        scheme: "postgres",
      },
      caching: { disabled: true },
    }),
  });
}

export async function ensureHyperdriveConfig(
  accountId: string,
  apiToken: string,
  params: { name: string; originConnectionString: string },
): Promise<{ id: string; name: string; created: boolean }> {
  const existing = await listHyperdriveConfigs(accountId, apiToken);
  const match = existing.find((cfg) => cfg.name === params.name);
  if (match) return { ...match, created: false };
  const created = await createHyperdriveConfig(accountId, apiToken, params);
  return { ...created, created: true };
}

function parsePostgresUrl(connectionString: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new CloudflareApiError("Invalid DATABASE_URL for Hyperdrive provisioning");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new CloudflareApiError("DATABASE_URL must be a PostgreSQL connection string");
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.replace(/^\//, "") || "cco",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export type WorkerRoute = {
  id: string;
  pattern: string;
  script: string;
};

export async function listWorkerRoutes(zoneId: string, apiToken: string): Promise<WorkerRoute[]> {
  try {
    return await cfRequest<WorkerRoute[]>(apiToken, `/zones/${zoneId}/workers/routes`);
  } catch {
    return [];
  }
}

export async function createWorkerRoute(
  zoneId: string,
  apiToken: string,
  pattern: string,
  scriptName: string,
): Promise<WorkerRoute> {
  return cfRequest<WorkerRoute>(apiToken, `/zones/${zoneId}/workers/routes`, {
    method: "POST",
    body: JSON.stringify({ pattern, script: scriptName }),
  });
}

export async function ensureWorkerRoute(
  zoneId: string,
  apiToken: string,
  pattern: string,
  scriptName: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await listWorkerRoutes(zoneId, apiToken);
  const match = existing.find((route) => route.pattern === pattern);
  if (match) {
    if (match.script !== scriptName) {
      await cfRequest(apiToken, `/zones/${zoneId}/workers/routes/${match.id}`, {
        method: "PUT",
        body: JSON.stringify({ pattern, script: scriptName }),
      });
    }
    return { id: match.id, created: false };
  }
  const created = await createWorkerRoute(zoneId, apiToken, pattern, scriptName);
  return { id: created.id, created: true };
}

export async function getZoneIdForHostname(
  apiToken: string,
  hostname: string,
): Promise<string | null> {
  const zones = await cfRequest<Array<{ id: string; name: string }>>(apiToken, "/zones");
  const parts = hostname.split(".").slice(-2).join(".");
  const match = zones.find((zone) => zone.name === parts || hostname.endsWith(`.${zone.name}`));
  return match?.id ?? null;
}

export async function putKvValue(
  accountId: string,
  apiToken: string,
  namespaceId: string,
  key: string,
  value: string,
  expirationTtl?: number,
): Promise<void> {
  const params = new URLSearchParams();
  if (expirationTtl != null) params.set("expiration_ttl", String(expirationTtl));
  const query = params.toString();
  await cfRequest(
    apiToken,
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}${query ? `?${query}` : ""}`,
    {
      method: "PUT",
      body: value,
      headers: { "Content-Type": "text/plain" },
    },
  );
}

export async function getKvValue(
  accountId: string,
  apiToken: string,
  namespaceId: string,
  key: string,
): Promise<string | null> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new CloudflareApiError(`KV read failed (${res.status})`, res.status);
  }
  return res.text();
}

export async function deleteKvValue(
  accountId: string,
  apiToken: string,
  namespaceId: string,
  key: string,
): Promise<void> {
  await cfRequest(
    apiToken,
    `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}

export async function bulkGetKvValues(
  accountId: string,
  apiToken: string,
  namespaceId: string,
  keys: string[],
): Promise<Array<string | null>> {
  if (keys.length === 0) return [];
  return Promise.all(keys.map((key) => getKvValue(accountId, apiToken, namespaceId, key)));
}
