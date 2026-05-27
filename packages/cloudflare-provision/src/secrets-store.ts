import { cfRequest, CloudflareApiError } from "./cloudflare-api";
import type { CcoWorkerScriptName } from "./worker-definitions";

/** Default Secrets Store name for CCO BYO installs. */
export const CCO_SECRETS_STORE_NAME = "cco";

/** Account-level secret names in Cloudflare Secrets Store. */
export const CCO_STORE_SECRET = {
  PCO_CLIENT_SECRET: "cco/pco_client_secret",
  PCO_WEBHOOK_SECRETS: "cco/pco_webhook_secrets",
  GIPHY_API_KEY: "cco/giphy_api_key",
  CLOUDFLARE_API_TOKEN: "cco/cloudflare_api_token",
  VAPID_PRIVATE_KEY: "cco/vapid_private_key",
  R2_ACCESS_KEY_ID: "cco/r2_access_key_id",
  R2_SECRET_ACCESS_KEY: "cco/r2_secret_access_key",
  SESSION_SECRET: "cco/session_secret",
  TOKEN_ENCRYPTION_KEY: "cco/token_encryption_key",
  CF_INTERNAL_SECRET: "cco/cf_internal_secret",
} as const;

export type CcoStoreSecretName = (typeof CCO_STORE_SECRET)[keyof typeof CCO_STORE_SECRET];

export const CCO_ORG_STORE_SECRETS: readonly CcoStoreSecretName[] = [
  CCO_STORE_SECRET.PCO_CLIENT_SECRET,
  CCO_STORE_SECRET.PCO_WEBHOOK_SECRETS,
  CCO_STORE_SECRET.GIPHY_API_KEY,
  CCO_STORE_SECRET.CLOUDFLARE_API_TOKEN,
  CCO_STORE_SECRET.VAPID_PRIVATE_KEY,
  CCO_STORE_SECRET.R2_ACCESS_KEY_ID,
  CCO_STORE_SECRET.R2_SECRET_ACCESS_KEY,
] as const;

export const CCO_PLATFORM_STORE_SECRETS: readonly CcoStoreSecretName[] = [
  CCO_STORE_SECRET.SESSION_SECRET,
  CCO_STORE_SECRET.TOKEN_ENCRYPTION_KEY,
  CCO_STORE_SECRET.CF_INTERNAL_SECRET,
] as const;

/** Worker binding name → store secret name. */
export const CCO_STORE_BINDING_MAP = {
  SESSION_SECRET: CCO_STORE_SECRET.SESSION_SECRET,
  TOKEN_ENCRYPTION_KEY: CCO_STORE_SECRET.TOKEN_ENCRYPTION_KEY,
  CF_INTERNAL_SECRET: CCO_STORE_SECRET.CF_INTERNAL_SECRET,
  SETUP_BOOTSTRAP_SECRET: CCO_STORE_SECRET.CF_INTERNAL_SECRET,
  INTERNAL_FORWARD_SECRET: CCO_STORE_SECRET.CF_INTERNAL_SECRET,
  INTERNAL_AUTH_SECRET: CCO_STORE_SECRET.CF_INTERNAL_SECRET,
  PUSH_INTERNAL_SECRET: CCO_STORE_SECRET.CF_INTERNAL_SECRET,
  RECONCILE_INTERNAL_SECRET: CCO_STORE_SECRET.CF_INTERNAL_SECRET,
  WEBHOOK_SECRETS: CCO_STORE_SECRET.PCO_WEBHOOK_SECRETS,
  GIPHY_API_KEY: CCO_STORE_SECRET.GIPHY_API_KEY,
  PCO_CLIENT_SECRET: CCO_STORE_SECRET.PCO_CLIENT_SECRET,
  CLOUDFLARE_API_TOKEN: CCO_STORE_SECRET.CLOUDFLARE_API_TOKEN,
  VAPID_PRIVATE_KEY: CCO_STORE_SECRET.VAPID_PRIVATE_KEY,
  R2_ACCESS_KEY_ID: CCO_STORE_SECRET.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: CCO_STORE_SECRET.R2_SECRET_ACCESS_KEY,
} as const;

export type CcoStoreBindingName = keyof typeof CCO_STORE_BINDING_MAP;

export type SecretsStoreBinding = {
  type: "secrets_store_secret";
  name: string;
  store_id: string;
  secret_name: string;
};

type SecretsStoreRecord = {
  id: string;
  name: string;
};

type StoreSecretRecord = {
  id: string;
  name: string;
  status?: string;
};

export async function listSecretsStores(
  accountId: string,
  apiToken: string,
): Promise<SecretsStoreRecord[]> {
  return cfRequest<SecretsStoreRecord[]>(
    apiToken,
    `/accounts/${accountId}/secrets_store/stores`,
  );
}

export async function createSecretsStore(
  accountId: string,
  apiToken: string,
  name: string = CCO_SECRETS_STORE_NAME,
): Promise<SecretsStoreRecord> {
  return cfRequest<SecretsStoreRecord>(
    apiToken,
    `/accounts/${accountId}/secrets_store/stores`,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
}

/** Returns existing CCO store or creates one. */
export async function ensureSecretsStore(
  accountId: string,
  apiToken: string,
  name: string = CCO_SECRETS_STORE_NAME,
): Promise<SecretsStoreRecord> {
  const stores = await listSecretsStores(accountId, apiToken);
  const existing = stores.find((store) => store.name === name);
  if (existing) return existing;
  return createSecretsStore(accountId, apiToken, name);
}

export async function listStoreSecrets(
  accountId: string,
  apiToken: string,
  storeId: string,
): Promise<StoreSecretRecord[]> {
  return cfRequest<StoreSecretRecord[]>(
    apiToken,
    `/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
  );
}

export async function hasStoreSecret(
  accountId: string,
  apiToken: string,
  storeId: string,
  secretName: string,
): Promise<boolean> {
  const secrets = await listStoreSecrets(accountId, apiToken, storeId);
  return secrets.some((secret) => secret.name === secretName && secret.status !== "deleted");
}

async function createStoreSecret(
  accountId: string,
  apiToken: string,
  storeId: string,
  secretName: string,
  value: string,
): Promise<void> {
  await cfRequest<StoreSecretRecord[]>(
    apiToken,
    `/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
    {
      method: "POST",
      body: JSON.stringify([
        {
          name: secretName,
          value,
          scopes: ["workers"],
          comment: "CCO BYO",
        },
      ]),
    },
  );
}

async function updateStoreSecret(
  accountId: string,
  apiToken: string,
  storeId: string,
  secretId: string,
  value: string,
): Promise<void> {
  await cfRequest<StoreSecretRecord>(
    apiToken,
    `/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        value,
        scopes: ["workers"],
        comment: "CCO BYO",
      }),
    },
  );
}

/** Create or update a secret in the church Secrets Store. */
export async function upsertStoreSecret(
  accountId: string,
  apiToken: string,
  storeId: string,
  secretName: string,
  value: string,
): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CloudflareApiError(`Secret value for "${secretName}" cannot be empty`, 400);
  }

  const secrets = await listStoreSecrets(accountId, apiToken, storeId);
  const existing = secrets.find((secret) => secret.name === secretName && secret.status !== "deleted");
  if (existing) {
    await updateStoreSecret(accountId, apiToken, storeId, existing.id, trimmed);
    return;
  }
  await createStoreSecret(accountId, apiToken, storeId, secretName, trimmed);
}

export function buildStoreSecretBinding(
  bindingName: CcoStoreBindingName,
  storeId: string,
): SecretsStoreBinding {
  return {
    type: "secrets_store_secret",
    name: bindingName,
    store_id: storeId,
    secret_name: CCO_STORE_BINDING_MAP[bindingName],
  };
}

const WORKER_STORE_BINDINGS: Record<CcoWorkerScriptName, readonly CcoStoreBindingName[]> = {
  "cco-api": [
    "SESSION_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "CF_INTERNAL_SECRET",
    "SETUP_BOOTSTRAP_SECRET",
    "PCO_CLIENT_SECRET",
    "WEBHOOK_SECRETS",
    "GIPHY_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "VAPID_PRIVATE_KEY",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ],
  "cco-realtime-fanout": ["SESSION_SECRET", "CF_INTERNAL_SECRET"],
  "cco-pco-webhook": ["WEBHOOK_SECRETS", "INTERNAL_FORWARD_SECRET"],
  "cco-giphy-proxy": ["GIPHY_API_KEY", "INTERNAL_AUTH_SECRET"],
  "cco-push-consumer": ["PUSH_INTERNAL_SECRET"],
  "cco-reconcile-cron": ["RECONCILE_INTERNAL_SECRET"],
};

export function buildWorkerSecretsStoreBindings(
  scriptName: CcoWorkerScriptName,
  storeId: string,
): SecretsStoreBinding[] {
  const names = WORKER_STORE_BINDINGS[scriptName];
  const seen = new Set<string>();
  const bindings: SecretsStoreBinding[] = [];
  for (const bindingName of names) {
    const secretName = CCO_STORE_BINDING_MAP[bindingName];
    if (seen.has(secretName)) continue;
    seen.add(secretName);
    bindings.push(buildStoreSecretBinding(bindingName, storeId));
  }
  return bindings;
}

export const CCO_WEB_STORE_BINDINGS: readonly CcoStoreBindingName[] = ["SESSION_SECRET"];

export function buildWebWorkerSecretsStoreBindings(storeId: string): SecretsStoreBinding[] {
  return CCO_WEB_STORE_BINDINGS.map((name) => buildStoreSecretBinding(name, storeId));
}

export async function seedPlatformStoreSecrets(
  accountId: string,
  apiToken: string,
  storeId: string,
  secrets: {
    SESSION_SECRET: string;
    TOKEN_ENCRYPTION_KEY: string;
    CF_INTERNAL_SECRET: string;
  },
): Promise<void> {
  await upsertStoreSecret(
    accountId,
    apiToken,
    storeId,
    CCO_STORE_SECRET.SESSION_SECRET,
    secrets.SESSION_SECRET,
  );
  await upsertStoreSecret(
    accountId,
    apiToken,
    storeId,
    CCO_STORE_SECRET.TOKEN_ENCRYPTION_KEY,
    secrets.TOKEN_ENCRYPTION_KEY,
  );
  await upsertStoreSecret(
    accountId,
    apiToken,
    storeId,
    CCO_STORE_SECRET.CF_INTERNAL_SECRET,
    secrets.CF_INTERNAL_SECRET,
  );
}
