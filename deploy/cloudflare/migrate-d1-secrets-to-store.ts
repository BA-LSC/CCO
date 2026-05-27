#!/usr/bin/env bun
/**
 * Recovery: copy org secrets from D1 *_enc columns into Cloudflare Secrets Store.
 *
 * Use when bootstrap set cloudflare_secrets_store_id but never migrated encrypted
 * org secrets (Apply Update skipped migration because store id was already set).
 *
 * Mode A — local decrypt (needs TOKEN_ENCRYPTION_KEY matching the worker):
 *   export CLOUDFLARE_API_TOKEN=...
 *   export CLOUDFLARE_ACCOUNT_ID=2e5c1532f81b48b3a2d2763e11b81ed2
 *   export CCO_D1_DATABASE_ID=13213231-69e4-40c0-8858-967a90ecce7a
 *   export CLOUDFLARE_SECRETS_STORE_ID=6671a82ba6ac40c8844739c80f982a3d  # optional; read from D1 if omitted
 *   export TOKEN_ENCRYPTION_KEY=...  # same key bound to cco-api worker
 *   bun deploy/cloudflare/migrate-d1-secrets-to-store.ts
 *
 * Mode B — invoke worker recovery endpoint (after deploying API with /internal/migrate-org-secrets-to-store):
 *   export CLOUDFLARE_API_TOKEN=...
 *   bun deploy/cloudflare/migrate-d1-secrets-to-store.ts --invoke-api https://api.example.com
 */
import {
  executeD1Query,
  queryD1,
  upsertStoreSecret,
  verifyCloudflareUpdateApplyPermissions,
} from "../../packages/cloudflare-provision/src/index.ts";
import {
  collectOrganizationSecretsForStoreMigration,
  organizationHasPendingSecretsStoreMigration,
  organizationSecretsStoreMigrationDbPatch,
} from "../../services/api/src/services/org-secrets.ts";

type OrgRow = {
  id: string;
  cloudflare_secrets_store_id: string | null;
  pco_client_secret_enc: string | null;
  pco_webhook_secret_enc: string | null;
  giphy_api_key_enc: string | null;
  vapid_private_key_enc: string | null;
  cloudflare_api_token_enc: string | null;
  cloudflare_r2_access_key_id_enc: string | null;
  cloudflare_r2_secret_access_key_enc: string | null;
  pco_client_secret_configured: number | null;
  pco_webhook_secrets_configured: number | null;
  giphy_api_key_configured: number | null;
  vapid_private_key_configured: number | null;
  cloudflare_api_token_configured: number | null;
  cloudflare_r2_access_key_configured: number | null;
  cloudflare_r2_secret_access_key_configured: number | null;
  pco_web_redirect_uri: string | null;
  pco_webhook_url: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function parseInvokeApiArg(): string | null {
  const index = process.argv.indexOf("--invoke-api");
  if (index === -1) return null;
  const value = process.argv[index + 1]?.trim();
  if (!value) {
    console.error("Usage: --invoke-api https://api.example.com");
    process.exit(1);
  }
  return value.replace(/\/+$/, "");
}

function resolveOrgHostnames(org: OrgRow): { chatHostname: string; apiHostname: string } | null {
  try {
    const chatHostname = org.pco_web_redirect_uri
      ? new URL(org.pco_web_redirect_uri).hostname
      : "";
    const apiHostname = org.pco_webhook_url ? new URL(org.pco_webhook_url).hostname : "";
    if (!chatHostname || !apiHostname) return null;
    return { chatHostname, apiHostname };
  } catch {
    return null;
  }
}

function toMigrationOrg(org: OrgRow) {
  return {
    cloudflareSecretsStoreId: org.cloudflare_secrets_store_id,
    pcoClientSecretEnc: org.pco_client_secret_enc,
    pcoWebhookSecretEnc: org.pco_webhook_secret_enc,
    giphyApiKeyEnc: org.giphy_api_key_enc,
    vapidPrivateKeyEnc: org.vapid_private_key_enc,
    cloudflareApiTokenEnc: org.cloudflare_api_token_enc,
    cloudflareR2AccessKeyIdEnc: org.cloudflare_r2_access_key_id_enc,
    cloudflareR2SecretAccessKeyEnc: org.cloudflare_r2_secret_access_key_enc,
    pcoClientSecretConfigured: Boolean(org.pco_client_secret_configured),
    pcoWebhookSecretsConfigured: Boolean(org.pco_webhook_secrets_configured),
    giphyApiKeyConfigured: Boolean(org.giphy_api_key_configured),
    vapidPrivateKeyConfigured: Boolean(org.vapid_private_key_configured),
    cloudflareApiTokenConfigured: Boolean(org.cloudflare_api_token_configured),
    cloudflareR2AccessKeyConfigured: Boolean(org.cloudflare_r2_access_key_configured),
    cloudflareR2SecretAccessKeyConfigured: Boolean(org.cloudflare_r2_secret_access_key_configured),
  };
}

async function loadOrganizationRow(
  accountId: string,
  apiToken: string,
  databaseId: string,
): Promise<OrgRow> {
  const batches = await queryD1(
    accountId,
    apiToken,
    databaseId,
    `SELECT id, cloudflare_secrets_store_id,
      pco_client_secret_enc, pco_webhook_secret_enc, giphy_api_key_enc,
      vapid_private_key_enc, cloudflare_api_token_enc,
      cloudflare_r2_access_key_id_enc, cloudflare_r2_secret_access_key_enc,
      pco_client_secret_configured, pco_webhook_secrets_configured,
      giphy_api_key_configured, vapid_private_key_configured,
      cloudflare_api_token_configured, cloudflare_r2_access_key_configured,
      cloudflare_r2_secret_access_key_configured,
      pco_web_redirect_uri, pco_webhook_url
     FROM organizations
     WHERE setup_completed_at IS NOT NULL
     ORDER BY setup_completed_at DESC
     LIMIT 1`,
  );
  const row = batches[0]?.results?.[0] as OrgRow | undefined;
  if (!row?.id) {
    throw new Error("No organization row found in D1");
  }
  return row;
}

async function invokeWorkerRecovery(apiOrigin: string, apiToken: string): Promise<void> {
  const res = await fetch(`${apiOrigin}/internal/migrate-org-secrets-to-store`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    migrated?: boolean;
    reason?: string;
    secretsStoreId?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (body.migrated) {
    console.log(`Migrated org secrets to store ${body.secretsStoreId ?? "(unknown)"}`);
  } else {
    console.log(`Nothing to migrate (${body.reason ?? "already complete"})`);
  }
}

async function migrateLocally(
  accountId: string,
  apiToken: string,
  databaseId: string,
  storeIdOverride: string | undefined,
): Promise<void> {
  if (!process.env.TOKEN_ENCRYPTION_KEY?.trim()) {
    console.error("Missing TOKEN_ENCRYPTION_KEY (required for local decrypt mode)");
    process.exit(1);
  }

  const orgRow = await loadOrganizationRow(accountId, apiToken, databaseId);
  const org = toMigrationOrg(orgRow);

  if (!organizationHasPendingSecretsStoreMigration(org)) {
    console.log("Nothing to migrate: no D1 *_enc columns with Secrets Store id set");
    return;
  }

  const storeId = storeIdOverride?.trim() || org.cloudflareSecretsStoreId?.trim();
  if (!storeId) {
    throw new Error("cloudflare_secrets_store_id missing in D1 and CLOUDFLARE_SECRETS_STORE_ID not set");
  }

  const hostnames = resolveOrgHostnames(orgRow);
  if (hostnames) {
    await verifyCloudflareUpdateApplyPermissions({
      accountId,
      apiToken,
      chatHostname: hostnames.chatHostname,
      apiHostname: hostnames.apiHostname,
    });
  } else {
    console.warn("Skipping token preflight (could not parse org hostnames from D1 URLs)");
  }

  const upserts = collectOrganizationSecretsForStoreMigration(org);
  if (upserts.length === 0) {
    console.log("No decryptable org secrets found in D1");
    return;
  }

  for (const upsert of upserts) {
    await upsertStoreSecret(accountId, apiToken, storeId, upsert.secretName, upsert.value);
    console.log(`Upserted ${upsert.secretName}`);
  }

  const patch = organizationSecretsStoreMigrationDbPatch(org, storeId);
  const setClauses = Object.entries(patch)
    .map(([key, value]) => {
      const column = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (value === null) return `"${column}" = NULL`;
      if (typeof value === "boolean") return `"${column}" = ${value ? 1 : 0}`;
      return `"${column}" = '${String(value).replace(/'/g, "''")}'`;
    })
    .join(", ");

  await executeD1Query(
    accountId,
    apiToken,
    databaseId,
    `UPDATE organizations SET ${setClauses} WHERE id = '${orgRow.id.replace(/'/g, "''")}'`,
  );

  console.log(`Cleared D1 *_enc columns for organization ${orgRow.id}`);
  console.log("PCO OAuth should work after worker reads updated Secrets Store values");
}

const invokeApi = parseInvokeApiArg();
const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");

if (invokeApi) {
  await invokeWorkerRecovery(invokeApi, apiToken);
} else {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = requireEnv("CCO_D1_DATABASE_ID");
  const storeIdOverride = process.env.CLOUDFLARE_SECRETS_STORE_ID?.trim();
  await migrateLocally(accountId, apiToken, databaseId, storeIdOverride);
}
