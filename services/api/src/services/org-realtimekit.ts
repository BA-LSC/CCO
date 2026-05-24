import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";
import { provisionRealtimeKitFromApiToken } from "./cloudflare-realtimekit-provision";

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

export function getPresetNames(org?: typeof organizations.$inferSelect | null) {
  return {
    host:
      org?.realtimeKitPresetHost?.trim() ||
      process.env.REALTIMEKIT_PRESET_HOST?.trim() ||
      "host",
    member:
      org?.realtimeKitPresetMember?.trim() ||
      process.env.REALTIMEKIT_PRESET_MEMBER?.trim() ||
      "group_call_participant",
    guest:
      org?.realtimeKitPresetGuest?.trim() ||
      process.env.REALTIMEKIT_PRESET_GUEST?.trim() ||
      "guest",
  };
}

export async function updateOrganizationRealtimeKitFromToken(params: {
  organizationId: string;
  organizationName?: string;
  apiToken: string;
  existingAccountId?: string;
  existingAppId?: string;
  autoCreateApp?: boolean;
}): Promise<{ createdApp: boolean; presetsResolved: boolean }> {
  const apiToken = params.apiToken.trim();
  if (!apiToken) {
    throw new Error("Cloudflare API token is required");
  }

  const provisioned = await provisionRealtimeKitFromApiToken({
    apiToken,
    organizationName: params.organizationName,
    existingAccountId: params.existingAccountId,
    existingAppId: params.existingAppId,
    autoCreateApp: params.autoCreateApp ?? true,
  });

  await db
    .update(organizations)
    .set({
      cloudflareAccountId: provisioned.accountId,
      realtimeKitAppId: provisioned.appId,
      cloudflareApiTokenEnc: encryptSecret(apiToken),
      realtimeKitPresetHost: provisioned.presets?.host ?? null,
      realtimeKitPresetMember: provisioned.presets?.member ?? null,
      realtimeKitPresetGuest: provisioned.presets?.guest ?? null,
    })
    .where(eq(organizations.id, params.organizationId));

  return {
    createdApp: provisioned.createdApp,
    presetsResolved: provisioned.presets != null,
  };
}

/** Re-export for future first-time setup flow. */
export { provisionRealtimeKitFromApiToken } from "./cloudflare-realtimekit-provision";

export async function clearOrganizationRealtimeKitConfig(organizationId: string): Promise<void> {
  await db
    .update(organizations)
    .set({
      cloudflareAccountId: null,
      realtimeKitAppId: null,
      cloudflareApiTokenEnc: null,
      realtimeKitPresetHost: null,
      realtimeKitPresetMember: null,
      realtimeKitPresetGuest: null,
    })
    .where(eq(organizations.id, organizationId));
}

export async function enableOrganizationRealtimeKit(params: {
  organizationId: string;
  organizationName?: string;
  cloudflareApiToken?: string;
}): Promise<{ createdApp: boolean; presetsResolved: boolean; reconfigured: boolean }> {
  const org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const row = org[0];
  if (!row) throw new Error("Organization not found");

  const status = getOrganizationRealtimeKitStatus(row);
  if (status.realtimeKitFromEnv) {
    return { createdApp: false, presetsResolved: status.realtimeKitPresetsConfigured, reconfigured: false };
  }

  const token = params.cloudflareApiToken?.trim();
  if (token) {
    const result = await updateOrganizationRealtimeKitFromToken({
      organizationId: params.organizationId,
      organizationName: params.organizationName ?? row.name,
      apiToken: token,
      existingAccountId: status.realtimeKitAccountId || undefined,
      existingAppId: status.realtimeKitAppId || undefined,
    });
    return { ...result, reconfigured: true };
  }

  if (row.cloudflareApiTokenEnc) {
    const result = await updateOrganizationRealtimeKitFromToken({
      organizationId: params.organizationId,
      organizationName: params.organizationName ?? row.name,
      apiToken: decryptSecret(row.cloudflareApiTokenEnc),
      existingAccountId: status.realtimeKitAccountId || undefined,
      existingAppId: status.realtimeKitAppId || undefined,
    });
    return { ...result, reconfigured: true };
  }

  throw new Error("Cloudflare API token is required to enable calls");
}

export function getOrganizationRealtimeKitStatus(org: typeof organizations.$inferSelect) {
  const presets = getPresetNames(org);
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
    realtimeKitFromEnv: fromEnv && !fromDb,
    realtimeKitAccountId: org.cloudflareAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    realtimeKitAppId: org.realtimeKitAppId ?? process.env.REALTIMEKIT_APP_ID ?? "",
    realtimeKitTokenConfigured: fromDb || Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim()),
    realtimeKitPresetsConfigured: Boolean(
      org.realtimeKitPresetHost && org.realtimeKitPresetMember && org.realtimeKitPresetGuest,
    ),
    realtimeKitPresetHost: presets.host,
    realtimeKitPresetMember: presets.member,
    realtimeKitPresetGuest: presets.guest,
  };
}
