import { DEFAULT_PCO_OAUTH_SCOPE } from "@cco/pco-client";
import { eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { encryptSecret } from "../auth/token-crypto";
import {
  buildInstallSetupUrls,
  resolvePcoWebhookUrl,
} from "../auth/pco-redirect-uris";
import { db } from "../db";
import { organizations } from "../db/schema";
import {
  getOrganizationWithOAuthCredentials,
  getPendingSetupOrganization,
} from "./org-oauth";
import { invalidateOrgContextCache } from "./org-context-cache";

export const InstallHandoffSchema = z.object({
  churchName: z.string().min(1).max(120),
  chatHostname: z.string().min(1),
  apiHostname: z.string().min(1),
  cloudflareAccountId: z.string().min(1).optional(),
  cloudflareApiToken: z.string().min(1).optional(),
  cloudflareR2BucketName: z.string().min(1).optional(),
  cloudflareR2AccessKeyId: z.string().min(1).optional(),
  cloudflareR2SecretAccessKey: z.string().min(1).optional(),
  cloudflareKvPresenceNamespaceId: z.string().min(1).optional(),
  cloudflareKvDeployNamespaceId: z.string().min(1).optional(),
  cloudflarePushQueueId: z.string().min(1).optional(),
  realtimeKitAppId: z.string().min(1).optional(),
  realtimeKitPresetHost: z.string().min(1).optional(),
  realtimeKitPresetMember: z.string().min(1).optional(),
  realtimeKitPresetGuest: z.string().min(1).optional(),
});

export type InstallHandoffPayload = z.infer<typeof InstallHandoffSchema>;

export type InstallSetupContext = {
  fromInstall: true;
  churchName: string;
  signInRedirectUri: string;
  webhookUrl: string;
  apiRedirectUri: string;
  mobileRedirectUri: string;
  cloudflarePlatformProvisioned: boolean;
  readOnlyUrls: boolean;
};

function isPendingOrgName(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed === "Pending setup";
}

export async function applyInstallHandoff(payload: InstallHandoffPayload): Promise<void> {
  const urls = buildInstallSetupUrls({
    chatHostname: payload.chatHostname,
    apiHostname: payload.apiHostname,
  });

  const orgPatch = {
    name: payload.churchName.trim(),
    pcoWebRedirectUri: urls.signInRedirectUri,
    pcoWebhookUrl: urls.webhookUrl,
    cloudflareAccountId: payload.cloudflareAccountId ?? null,
    cloudflareApiTokenEnc: payload.cloudflareApiToken
      ? encryptSecret(payload.cloudflareApiToken)
      : null,
    cloudflareR2BucketName: payload.cloudflareR2BucketName ?? null,
    cloudflareR2AccessKeyIdEnc: payload.cloudflareR2AccessKeyId
      ? encryptSecret(payload.cloudflareR2AccessKeyId)
      : null,
    cloudflareR2SecretAccessKeyEnc: payload.cloudflareR2SecretAccessKey
      ? encryptSecret(payload.cloudflareR2SecretAccessKey)
      : null,
    cloudflareKvPresenceNamespaceId: payload.cloudflareKvPresenceNamespaceId ?? null,
    cloudflareKvDeployNamespaceId: payload.cloudflareKvDeployNamespaceId ?? null,
    cloudflarePushQueueId: payload.cloudflarePushQueueId ?? null,
    realtimeKitAppId: payload.realtimeKitAppId ?? null,
    realtimeKitPresetHost: payload.realtimeKitPresetHost ?? null,
    realtimeKitPresetMember: payload.realtimeKitPresetMember ?? null,
    realtimeKitPresetGuest: payload.realtimeKitPresetGuest ?? null,
    cloudflarePlatformProvisionedAt: new Date(),
  };

  const pending = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.setupCompletedAt))
    .limit(1);

  if (pending[0]) {
    await db.update(organizations).set(orgPatch).where(eq(organizations.id, pending[0].id));
  } else {
    const configured = await getOrganizationWithOAuthCredentials();
    if (configured) {
      await db
        .update(organizations)
        .set(orgPatch)
        .where(eq(organizations.id, configured.id));
    } else {
      await db.insert(organizations).values({
        ...orgPatch,
        pcoOrganizationId: `pending-${randomUUID()}`,
        pcoOauthScope: DEFAULT_PCO_OAUTH_SCOPE,
      });
    }
  }

  invalidateOrgContextCache();
}

export async function getInstallSetupContext(options: {
  chatHostname?: string | null;
  apiHostname?: string | null;
}): Promise<InstallSetupContext> {
  const org =
    (await getPendingSetupOrganization()) ?? (await getOrganizationWithOAuthCredentials());
  const urls = buildInstallSetupUrls({
    chatHostname: options.chatHostname,
    apiHostname: options.apiHostname,
  });

  const savedSignIn = org?.pcoWebRedirectUri?.trim();
  const savedWebhook = org?.pcoWebhookUrl?.trim();

  return {
    fromInstall: true,
    churchName: org && !isPendingOrgName(org.name) ? org.name.trim() : "",
    signInRedirectUri: savedSignIn || urls.signInRedirectUri,
    webhookUrl: savedWebhook ? resolvePcoWebhookUrl(savedWebhook) : urls.webhookUrl,
    apiRedirectUri: urls.apiRedirectUri,
    mobileRedirectUri: urls.mobileRedirectUri,
    cloudflarePlatformProvisioned: Boolean(org?.cloudflarePlatformProvisionedAt),
    readOnlyUrls: true,
  };
}
