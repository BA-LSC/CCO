import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";
import {
  listCloudflareAccounts,
  verifyCloudflareApiToken,
} from "./cloudflare-api";
import {
  provisionRealtimeKitFromApiToken,
  resolveCloudflareAccountId,
} from "./cloudflare-realtimekit-provision";
import {
  isMissingOrgMigrationColumnsError,
  ORG_MIGRATIONS_0021_0023_MESSAGE,
} from "./org-db-migrations";
import { selectConfiguredOrganizationRow } from "./configured-org-query";
import { hasExtendedOrganizationColumns } from "./org-schema-capabilities";

function rethrowCloudflareSaveError(err: unknown): never {
  if (isMissingOrgMigrationColumnsError(err)) {
    throw new Error(ORG_MIGRATIONS_0021_0023_MESSAGE);
  }
  throw err;
}

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

/** Shared Cloudflare API token for RealtimeKit and future Cloudflare integrations. */
export async function resolveCloudflareApiToken(): Promise<{
  apiToken: string;
  accountId: string;
} | null> {
  const org = await getConfiguredOrganization();
  if (org?.cloudflareApiTokenEnc) {
    return {
      apiToken: decryptSecret(org.cloudflareApiTokenEnc),
      accountId: org.cloudflareAccountId ?? "",
    };
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!apiToken) return null;

  return {
    apiToken,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "",
  };
}

export async function saveOrganizationCloudflareApiToken(params: {
  organizationId: string;
  apiToken: string;
  existingAccountId?: string;
}): Promise<{ accountId: string }> {
  const apiToken = params.apiToken.trim();
  if (!apiToken) {
    throw new Error("Cloudflare API token is required");
  }

  const verified = await verifyCloudflareApiToken(apiToken);
  if (verified.status !== "active") {
    throw new Error("Cloudflare API token is not active");
  }

  const accounts = await listCloudflareAccounts(apiToken);
  const accountId = resolveCloudflareAccountId(accounts, params.existingAccountId?.trim());

  if (!(await hasExtendedOrganizationColumns())) {
    throw new Error(ORG_MIGRATIONS_0021_0023_MESSAGE);
  }

  try {
    await db
      .update(organizations)
      .set({
        cloudflareApiTokenEnc: encryptSecret(apiToken),
        cloudflareAccountId: accountId,
      })
      .where(eq(organizations.id, params.organizationId));
  } catch (err) {
    rethrowCloudflareSaveError(err);
  }

  return { accountId };
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

  try {
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
  } catch (err) {
    rethrowCloudflareSaveError(err);
  }

  return {
    createdApp: provisioned.createdApp,
    presetsResolved: provisioned.presets != null,
  };
}

/** Re-export for future first-time setup flow. */
export { provisionRealtimeKitFromApiToken } from "./cloudflare-realtimekit-provision";

/** Disable RealtimeKit calls while keeping the Cloudflare API token for other features. */
export async function disableOrganizationRealtimeKitCalls(organizationId: string): Promise<void> {
  await db
    .update(organizations)
    .set({
      realtimeKitAppId: null,
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
  const row = await selectConfiguredOrganizationRow(eq(organizations.id, params.organizationId));
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

  throw new Error("Save a Cloudflare API token before enabling calls");
}

export function getOrganizationRealtimeKitStatus(org: typeof organizations.$inferSelect) {
  const presets = getPresetNames(org);
  const tokenFromDb = Boolean(org.cloudflareApiTokenEnc);
  const callsFromDb = Boolean(org.realtimeKitAppId && org.cloudflareApiTokenEnc);
  const fromEnv = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.REALTIMEKIT_APP_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );
  const tokenFromEnv = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());
  return {
    realtimeKitConfigured: callsFromDb || fromEnv,
    realtimeKitFromEnv: fromEnv && !callsFromDb,
    realtimeKitAccountId: org.cloudflareAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    realtimeKitAppId: org.realtimeKitAppId ?? process.env.REALTIMEKIT_APP_ID ?? "",
    cloudflareApiTokenConfigured: tokenFromDb || tokenFromEnv,
    /** @deprecated Use cloudflareApiTokenConfigured */
    realtimeKitTokenConfigured: tokenFromDb || tokenFromEnv,
    realtimeKitPresetsConfigured: Boolean(
      org.realtimeKitPresetHost && org.realtimeKitPresetMember && org.realtimeKitPresetGuest,
    ),
    realtimeKitPresetHost: presets.host,
    realtimeKitPresetMember: presets.member,
    realtimeKitPresetGuest: presets.guest,
  };
}
