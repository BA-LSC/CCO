import {
  CCO_STORE_SECRET,
  ensureSecretsStore,
  seedPlatformStoreSecrets,
  upsertStoreSecret,
  type CcoStoreSecretName,
  type ProvisionSecrets,
} from "@cco/cloudflare-provision";
import { eq } from "drizzle-orm";
import { decryptSecret } from "../auth/token-crypto";
import { decryptWebhookSecrets } from "../webhooks/secrets";
import { db } from "../db";
import { organizations } from "../db/schema";
import { isCloudflareRuntime } from "../runtime/worker-context";
import { invalidateOrgContextCache } from "./org-context-cache";
import type { ConfiguredOrganizationRow } from "./org-select";

/** True when org secrets are stored in Cloudflare Secrets Store (not D1 *_enc). */
export function orgUsesSecretsStore(
  org: Pick<ConfiguredOrganizationRow, "cloudflareSecretsStoreId">,
): boolean {
  return Boolean(org.cloudflareSecretsStoreId?.trim());
}

export function isPcoClientSecretConfigured(
  org: Pick<ConfiguredOrganizationRow, "pcoClientSecretConfigured" | "pcoClientSecretEnc">,
): boolean {
  return Boolean(org.pcoClientSecretConfigured || org.pcoClientSecretEnc);
}

export function isPcoWebhookSecretsConfigured(
  org: Pick<ConfiguredOrganizationRow, "pcoWebhookSecretsConfigured" | "pcoWebhookSecretEnc">,
): boolean {
  return Boolean(org.pcoWebhookSecretsConfigured || org.pcoWebhookSecretEnc);
}

export function isGiphyApiKeyConfigured(
  org: Pick<ConfiguredOrganizationRow, "giphyApiKeyConfigured" | "giphyApiKeyEnc">,
): boolean {
  return Boolean(org.giphyApiKeyConfigured || org.giphyApiKeyEnc);
}

export function isVapidPrivateKeyConfigured(
  org: Pick<
    ConfiguredOrganizationRow,
    "vapidPrivateKeyConfigured" | "vapidPrivateKeyEnc" | "vapidPublicKey"
  >,
): boolean {
  return Boolean(
    org.vapidPrivateKeyConfigured || (org.vapidPublicKey && org.vapidPrivateKeyEnc),
  );
}

export function isCloudflareApiTokenConfigured(
  org: Pick<ConfiguredOrganizationRow, "cloudflareApiTokenConfigured" | "cloudflareApiTokenEnc">,
): boolean {
  return Boolean(org.cloudflareApiTokenConfigured || org.cloudflareApiTokenEnc);
}

type OrganizationEncryptedSecretFields = Pick<
  ConfiguredOrganizationRow,
  | "cloudflareSecretsStoreId"
  | "pcoClientSecretEnc"
  | "pcoWebhookSecretEnc"
  | "giphyApiKeyEnc"
  | "vapidPrivateKeyEnc"
  | "cloudflareApiTokenEnc"
  | "cloudflareR2AccessKeyIdEnc"
  | "cloudflareR2SecretAccessKeyEnc"
>;

/** True when Secrets Store is configured but org secrets still live in D1 *_enc columns. */
export function organizationHasPendingSecretsStoreMigration(
  org: OrganizationEncryptedSecretFields,
): boolean {
  if (!org.cloudflareSecretsStoreId?.trim()) return false;
  return Boolean(
    org.pcoClientSecretEnc ||
      org.pcoWebhookSecretEnc ||
      org.giphyApiKeyEnc ||
      org.vapidPrivateKeyEnc ||
      org.cloudflareApiTokenEnc ||
      org.cloudflareR2AccessKeyIdEnc ||
      org.cloudflareR2SecretAccessKeyEnc,
  );
}

export type OrganizationSecretStoreUpsert = {
  secretName: CcoStoreSecretName;
  value: string;
};

/** Decrypt D1 *_enc columns into Secrets Store upserts (requires TOKEN_ENCRYPTION_KEY). */
export function collectOrganizationSecretsForStoreMigration(
  org: OrganizationEncryptedSecretFields,
): OrganizationSecretStoreUpsert[] {
  const upserts: OrganizationSecretStoreUpsert[] = [];

  if (org.pcoClientSecretEnc) {
    upserts.push({
      secretName: CCO_STORE_SECRET.PCO_CLIENT_SECRET,
      value: decryptSecret(org.pcoClientSecretEnc),
    });
  }

  if (org.pcoWebhookSecretEnc) {
    const webhookSecrets = decryptWebhookSecrets(org.pcoWebhookSecretEnc);
    if (webhookSecrets.length > 0) {
      upserts.push({
        secretName: CCO_STORE_SECRET.PCO_WEBHOOK_SECRETS,
        value: webhookSecrets.join("\n"),
      });
    }
  }

  if (org.giphyApiKeyEnc) {
    upserts.push({
      secretName: CCO_STORE_SECRET.GIPHY_API_KEY,
      value: decryptSecret(org.giphyApiKeyEnc),
    });
  }

  if (org.vapidPrivateKeyEnc) {
    upserts.push({
      secretName: CCO_STORE_SECRET.VAPID_PRIVATE_KEY,
      value: decryptSecret(org.vapidPrivateKeyEnc),
    });
  }

  if (org.cloudflareApiTokenEnc) {
    upserts.push({
      secretName: CCO_STORE_SECRET.CLOUDFLARE_API_TOKEN,
      value: decryptSecret(org.cloudflareApiTokenEnc),
    });
  }

  if (org.cloudflareR2AccessKeyIdEnc) {
    upserts.push({
      secretName: CCO_STORE_SECRET.R2_ACCESS_KEY_ID,
      value: decryptSecret(org.cloudflareR2AccessKeyIdEnc),
    });
  }

  if (org.cloudflareR2SecretAccessKeyEnc) {
    upserts.push({
      secretName: CCO_STORE_SECRET.R2_SECRET_ACCESS_KEY,
      value: decryptSecret(org.cloudflareR2SecretAccessKeyEnc),
    });
  }

  return upserts;
}

export function organizationSecretsStoreMigrationDbPatch(
  org: OrganizationEncryptedSecretFields & Pick<ConfiguredOrganizationRow, "pcoClientSecretConfigured" | "pcoWebhookSecretsConfigured" | "giphyApiKeyConfigured" | "vapidPrivateKeyConfigured" | "cloudflareApiTokenConfigured" | "cloudflareR2AccessKeyConfigured" | "cloudflareR2SecretAccessKeyConfigured">,
  storeId: string,
): Record<string, unknown> {
  return {
    cloudflareSecretsStoreId: storeId,
    pcoClientSecretConfigured: Boolean(org.pcoClientSecretEnc || org.pcoClientSecretConfigured),
    pcoWebhookSecretsConfigured: Boolean(
      org.pcoWebhookSecretEnc || org.pcoWebhookSecretsConfigured,
    ),
    giphyApiKeyConfigured: Boolean(org.giphyApiKeyEnc || org.giphyApiKeyConfigured),
    vapidPrivateKeyConfigured: Boolean(
      org.vapidPrivateKeyEnc || org.vapidPrivateKeyConfigured,
    ),
    cloudflareApiTokenConfigured: Boolean(
      org.cloudflareApiTokenEnc || org.cloudflareApiTokenConfigured,
    ),
    cloudflareR2AccessKeyConfigured: Boolean(
      org.cloudflareR2AccessKeyIdEnc || org.cloudflareR2AccessKeyConfigured,
    ),
    cloudflareR2SecretAccessKeyConfigured: Boolean(
      org.cloudflareR2SecretAccessKeyEnc || org.cloudflareR2SecretAccessKeyConfigured,
    ),
    pcoClientSecretEnc: null,
    pcoWebhookSecretEnc: null,
    giphyApiKeyEnc: null,
    vapidPrivateKeyEnc: null,
    cloudflareApiTokenEnc: null,
    cloudflareR2AccessKeyIdEnc: null,
    cloudflareR2SecretAccessKeyEnc: null,
  };
}

export type OrgSecretsStoreContext = {
  accountId: string;
  storeId: string;
  apiToken: string;
};

export async function resolveOrgSecretsStoreContext(
  org: ConfiguredOrganizationRow,
): Promise<OrgSecretsStoreContext | null> {
  if (!orgUsesSecretsStore(org)) return null;
  if (!org.cloudflareAccountId || !org.cloudflareSecretsStoreId) return null;

  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!apiToken) return null;

  return {
    accountId: org.cloudflareAccountId,
    storeId: org.cloudflareSecretsStoreId,
    apiToken,
  };
}

async function writeOrgSecretToStore(
  ctx: OrgSecretsStoreContext,
  secretName: string,
  value: string,
): Promise<void> {
  await upsertStoreSecret(ctx.accountId, ctx.apiToken, ctx.storeId, secretName, value);
}

export async function upsertOrgSecretForOrganization(params: {
  organizationId: string;
  secretName: string;
  value: string;
  configuredPatch: Record<string, unknown>;
}): Promise<void> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const org = rows[0];
  if (!org) throw new Error("Organization not found");

  if (isCloudflareRuntime() && orgUsesSecretsStore(org)) {
    const ctx = await resolveOrgSecretsStoreContext(org);
    if (!ctx) {
      throw new Error("Secrets Store is not configured for this organization");
    }
    await writeOrgSecretToStore(ctx, params.secretName, params.value);
    await db
      .update(organizations)
      .set(params.configuredPatch)
      .where(eq(organizations.id, params.organizationId));
    invalidateOrgContextCache();
    return;
  }

  throw new Error("Secrets Store writes require BYO Cloudflare runtime");
}

export async function ensureOrganizationSecretsStore(params: {
  accountId: string;
  apiToken: string;
  organizationId: string;
  platformSecrets?: ProvisionSecrets;
}): Promise<string> {
  const store = await ensureSecretsStore(params.accountId, params.apiToken);
  if (params.platformSecrets) {
    await seedPlatformStoreSecrets(
      params.accountId,
      params.apiToken,
      store.id,
      params.platformSecrets,
    );
  }
  await db
    .update(organizations)
    .set({ cloudflareSecretsStoreId: store.id })
    .where(eq(organizations.id, params.organizationId));
  invalidateOrgContextCache();
  return store.id;
}

export async function migrateOrganizationSecretsToStore(params: {
  organizationId: string;
  accountId: string;
  apiToken: string;
  platformSecrets?: ProvisionSecrets;
}): Promise<string> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const org = rows[0];
  if (!org) throw new Error("Organization not found");

  const storeId =
    org.cloudflareSecretsStoreId?.trim() ||
    (await ensureSecretsStore(params.accountId, params.apiToken)).id;

  if (params.platformSecrets) {
    await seedPlatformStoreSecrets(
      params.accountId,
      params.apiToken,
      storeId,
      params.platformSecrets,
    );
  }

  for (const upsert of collectOrganizationSecretsForStoreMigration(org)) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      upsert.secretName,
      upsert.value,
    );
  }

  await db
    .update(organizations)
    .set(organizationSecretsStoreMigrationDbPatch(org, storeId))
    .where(eq(organizations.id, params.organizationId));

  invalidateOrgContextCache();
  return storeId;
}
