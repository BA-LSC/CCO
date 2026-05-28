import { encryptSecret } from "../auth/token-crypto";
import { db } from "../db";
import { organizations } from "../db/schema";
import { eq } from "drizzle-orm";
import { orgUsesSecretsStore } from "./org-secrets";
import { resolveCloudflareAccountId } from "./cloudflare-realtimekit-provision";
import {
  ensureKvNamespace,
  ensureQueue,
  ensureR2Bucket,
  ensureCcoApiWorkerRoutes,
  getZoneIdForHostname,
  listCloudflareAccounts,
  verifyCloudflareApiToken,
} from "@cco/cloudflare-provision";
import { ensureCloudflarePlatformColumns } from "./org-schema-capabilities";
import { invalidateOrgContextCache } from "./org-context-cache";

export const CCO_R2_BUCKET_PREFIX = "cco-uploads";
export const CCO_KV_PRESENCE_TITLE = "cco-presence";
export const CCO_KV_DEPLOY_TITLE = "cco-deploy";
export const CCO_PUSH_QUEUE_NAME = "cco-push-notifications";

export type CloudflarePlatformProvisionResult = {
  accountId: string;
  r2BucketName: string;
  kvPresenceNamespaceId: string;
  kvDeployNamespaceId: string;
  pushQueueId: string;
  workerRoutes: Array<{ pattern: string; script: string; created: boolean }>;
  r2Created: boolean;
};

function defaultR2BucketName(accountId: string): string {
  return `${CCO_R2_BUCKET_PREFIX}-${accountId.slice(0, 8).toLowerCase()}`;
}

function readApiDomain(): string | null {
  const raw = process.env.API_DOMAIN?.trim() || process.env.NEXT_PUBLIC_WS_URL?.replace(/^wss:\/\//, "");
  return raw || null;
}

export async function provisionCloudflarePlatform(params: {
  organizationId: string;
  apiToken: string;
  existingAccountId?: string;
}): Promise<CloudflarePlatformProvisionResult> {
  const apiToken = params.apiToken.trim();
  if (!apiToken) throw new Error("Cloudflare API token is required");

  const verified = await verifyCloudflareApiToken(apiToken);
  if (verified.status !== "active") {
    throw new Error("Cloudflare API token is not active");
  }

  const accounts = await listCloudflareAccounts(apiToken);
  const accountId = resolveCloudflareAccountId(accounts, params.existingAccountId?.trim());

  const r2BucketName = defaultR2BucketName(accountId);
  const r2 = await ensureR2Bucket(accountId, apiToken, r2BucketName);
  const presenceKv = await ensureKvNamespace(accountId, apiToken, CCO_KV_PRESENCE_TITLE);
  const deployKv = await ensureKvNamespace(accountId, apiToken, CCO_KV_DEPLOY_TITLE);
  const pushQueue = await ensureQueue(accountId, apiToken, CCO_PUSH_QUEUE_NAME);

  const workerRoutes: CloudflarePlatformProvisionResult["workerRoutes"] = [];
  const apiDomain = readApiDomain();
  if (apiDomain) {
    const zoneId = await getZoneIdForHostname(apiToken, apiDomain);
    if (zoneId) {
      try {
        const ensured = await ensureCcoApiWorkerRoutes(zoneId, apiToken, apiDomain);
        workerRoutes.push(...ensured);
      } catch (err) {
        console.warn("[cloudflare provision] Worker routes skipped:", err);
      }
    }
  }

  await ensureCloudflarePlatformColumns();

  const orgRows = await db
    .select({ cloudflareSecretsStoreId: organizations.cloudflareSecretsStoreId })
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const org = orgRows[0];
  const usesStore = org ? orgUsesSecretsStore(org) : false;

  await db
    .update(organizations)
    .set({
      cloudflareAccountId: accountId,
      ...(usesStore
        ? {
            cloudflareApiTokenConfigured: true,
            cloudflareApiTokenEnc: null,
          }
        : { cloudflareApiTokenEnc: encryptSecret(apiToken) }),
      cloudflareR2BucketName: r2BucketName,
      cloudflareKvPresenceNamespaceId: presenceKv.id,
      cloudflareKvDeployNamespaceId: deployKv.id,
      cloudflarePushQueueId: pushQueue.queue_id,
      cloudflarePlatformProvisionedAt: new Date(),
    })
    .where(eq(organizations.id, params.organizationId));

  invalidateOrgContextCache();

  return {
    accountId,
    r2BucketName,
    kvPresenceNamespaceId: presenceKv.id,
    kvDeployNamespaceId: deployKv.id,
    pushQueueId: pushQueue.queue_id,
    workerRoutes,
    r2Created: r2.created,
  };
}

export function isCloudflarePlatformFromEnv(
  org: Pick<typeof organizations.$inferSelect, "cloudflareR2BucketName">,
): boolean {
  const fromEnv = Boolean(
    process.env.CLOUDFLARE_R2_BUCKET?.trim() &&
      process.env.CLOUDFLARE_KV_PRESENCE_NAMESPACE_ID?.trim(),
  );
  return fromEnv && !org.cloudflareR2BucketName;
}

export async function getOrganizationCloudflarePlatformStatus(
  org: Pick<
    typeof organizations.$inferSelect,
    | "cloudflareAccountId"
    | "cloudflareR2BucketName"
    | "cloudflareKvPresenceNamespaceId"
    | "cloudflareKvDeployNamespaceId"
    | "cloudflarePushQueueId"
    | "cloudflarePlatformProvisionedAt"
    | "cloudflareApiTokenEnc"
  >,
) {
  const fromEnv = Boolean(
    process.env.CLOUDFLARE_R2_BUCKET?.trim() &&
      process.env.CLOUDFLARE_KV_PRESENCE_NAMESPACE_ID?.trim(),
  );
  return {
    cloudflarePlatformConfigured:
      Boolean(org.cloudflareR2BucketName && org.cloudflareKvPresenceNamespaceId) || fromEnv,
    cloudflarePlatformFromEnv: isCloudflarePlatformFromEnv(org),
    cloudflareR2BucketName: org.cloudflareR2BucketName ?? process.env.CLOUDFLARE_R2_BUCKET ?? "",
    cloudflarePushQueueId: org.cloudflarePushQueueId ?? process.env.CLOUDFLARE_PUSH_QUEUE_ID ?? "",
    cloudflarePlatformProvisionedAt: org.cloudflarePlatformProvisionedAt?.toISOString() ?? null,
    cloudflareKvConfigured: Boolean(org.cloudflareKvPresenceNamespaceId && org.cloudflareKvDeployNamespaceId),
  };
}
