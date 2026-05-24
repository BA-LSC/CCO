import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";

export type RealtimeKitConfig = {
  accountId: string;
  appId: string;
  apiToken: string;
};

export async function resolveRealtimeKitConfig(): Promise<RealtimeKitConfig | null> {
  const org = await getConfiguredOrganization();
  if (org?.cloudflareAccountId && org.realtimeKitAppId && org.cloudflareApiTokenEnc) {
    return {
      accountId: org.cloudflareAccountId,
      appId: org.realtimeKitAppId,
      apiToken: decryptSecret(org.cloudflareApiTokenEnc),
    };
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const appId = process.env.REALTIMEKIT_APP_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !appId || !apiToken) return null;

  return { accountId, appId, apiToken };
}

export function getPresetNames() {
  return {
    host: process.env.REALTIMEKIT_PRESET_HOST?.trim() || "host",
    member: process.env.REALTIMEKIT_PRESET_MEMBER?.trim() || "group_call_participant",
    guest: process.env.REALTIMEKIT_PRESET_GUEST?.trim() || "guest",
  };
}

export async function updateOrganizationRealtimeKitConfig(params: {
  organizationId: string;
  accountId: string;
  appId: string;
  apiToken: string;
}): Promise<void> {
  const accountId = params.accountId.trim();
  const appId = params.appId.trim();
  const apiToken = params.apiToken.trim();
  if (!accountId || !appId) {
    throw new Error("Cloudflare account ID and RealtimeKit app ID are required");
  }

  const org = await db
    .select({ cloudflareApiTokenEnc: organizations.cloudflareApiTokenEnc })
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);

  let tokenEnc: string | null | undefined =
    apiToken === "__keep__" ? org[0]?.cloudflareApiTokenEnc : apiToken ? encryptSecret(apiToken) : null;

  if (apiToken === "__keep__" && !tokenEnc) {
    const envToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (envToken) tokenEnc = encryptSecret(envToken);
  }

  if (!tokenEnc) {
    throw new Error("Cloudflare API token is required");
  }

  await db
    .update(organizations)
    .set({
      cloudflareAccountId: accountId,
      realtimeKitAppId: appId,
      cloudflareApiTokenEnc: tokenEnc,
    })
    .where(eq(organizations.id, params.organizationId));
}

export function getOrganizationRealtimeKitStatus(org: typeof organizations.$inferSelect) {
  const fromDb = Boolean(
    org.cloudflareAccountId && org.realtimeKitAppId && org.cloudflareApiTokenEnc,
  );
  const fromEnv = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.REALTIMEKIT_APP_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );
  return {
    realtimeKitConfigured: fromDb || fromEnv,
    realtimeKitAccountId: org.cloudflareAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    realtimeKitAppId: org.realtimeKitAppId ?? process.env.REALTIMEKIT_APP_ID ?? "",
    realtimeKitTokenConfigured: fromDb || Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim()),
    realtimeKitPresetHost: getPresetNames().host,
    realtimeKitPresetMember: getPresetNames().member,
    realtimeKitPresetGuest: getPresetNames().guest,
  };
}
