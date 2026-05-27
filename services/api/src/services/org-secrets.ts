import {
  CCO_STORE_SECRET,
  ensureSecretsStore,
  seedPlatformStoreSecrets,
  upsertStoreSecret,
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
  platformSecrets: ProvisionSecrets;
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

  await seedPlatformStoreSecrets(
    params.accountId,
    params.apiToken,
    storeId,
    params.platformSecrets,
  );

  if (org.pcoClientSecretEnc) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      CCO_STORE_SECRET.PCO_CLIENT_SECRET,
      decryptSecret(org.pcoClientSecretEnc),
    );
  }

  if (org.pcoWebhookSecretEnc) {
    const webhookSecrets = decryptWebhookSecrets(org.pcoWebhookSecretEnc);
    if (webhookSecrets.length > 0) {
      await upsertStoreSecret(
        params.accountId,
        params.apiToken,
        storeId,
        CCO_STORE_SECRET.PCO_WEBHOOK_SECRETS,
        webhookSecrets.join("\n"),
      );
    }
  }

  if (org.giphyApiKeyEnc) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      CCO_STORE_SECRET.GIPHY_API_KEY,
      decryptSecret(org.giphyApiKeyEnc),
    );
  }

  if (org.vapidPrivateKeyEnc) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      CCO_STORE_SECRET.VAPID_PRIVATE_KEY,
      decryptSecret(org.vapidPrivateKeyEnc),
    );
  }

  if (org.cloudflareApiTokenEnc) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      CCO_STORE_SECRET.CLOUDFLARE_API_TOKEN,
      decryptSecret(org.cloudflareApiTokenEnc),
    );
  }

  if (org.cloudflareR2AccessKeyIdEnc) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      CCO_STORE_SECRET.R2_ACCESS_KEY_ID,
      decryptSecret(org.cloudflareR2AccessKeyIdEnc),
    );
  }

  if (org.cloudflareR2SecretAccessKeyEnc) {
    await upsertStoreSecret(
      params.accountId,
      params.apiToken,
      storeId,
      CCO_STORE_SECRET.R2_SECRET_ACCESS_KEY,
      decryptSecret(org.cloudflareR2SecretAccessKeyEnc),
    );
  }

  await db
    .update(organizations)
    .set({
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
    })
    .where(eq(organizations.id, params.organizationId));

  invalidateOrgContextCache();
  return storeId;
}
