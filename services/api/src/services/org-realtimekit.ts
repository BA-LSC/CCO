import { CCO_STORE_SECRET } from "@cco/cloudflare-provision";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";
import {
  isCloudflareApiTokenConfigured,
  orgUsesSecretsStore,
  upsertOrgSecretForOrganization,
} from "./org-secrets";
import { isCloudflareRuntime } from "../runtime/worker-context";
import {
  listCloudflareAccounts,
  verifyCloudflareApiToken,
} from "./cloudflare-api";
import {
  provisionRealtimeKitFromApiToken,
  resolveCloudflareAccountId,
} from "./cloudflare-realtimekit-provision";
import { invalidateOrgContextCache } from "./org-context-cache";
import { ensureCloudflareOrganizationColumns } from "./org-schema-capabilities";

export type RealtimeKitConfig = {
  accountId: string;
  appId: string;
  apiToken: string;
};

export async function resolveRealtimeKitConfig(): Promise<RealtimeKitConfig | null> {
  const org = await getConfiguredOrganization();
  if (org?.cloudflareAccountId && org.realtimeKitAppId) {
    const apiToken =
      orgUsesSecretsStore(org) && isCloudflareRuntime()
        ? process.env.CLOUDFLARE_API_TOKEN?.trim()
        : org.cloudflareApiTokenEnc
          ? decryptSecret(org.cloudflareApiTokenEnc)
          : undefined;
    if (apiToken) {
      return {
        accountId: org.cloudflareAccountId,
        appId: org.realtimeKitAppId,
        apiToken,
      };
    }
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
  if (org && isCloudflareApiTokenConfigured(org)) {
    const apiToken =
      orgUsesSecretsStore(org) && isCloudflareRuntime()
        ? process.env.CLOUDFLARE_API_TOKEN?.trim()
        : org.cloudflareApiTokenEnc
          ? decryptSecret(org.cloudflareApiTokenEnc)
          : undefined;
    if (apiToken) {
      return {
        apiToken,
        accountId: org.cloudflareAccountId ?? "",
      };
    }
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

  await ensureCloudflareOrganizationColumns();

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const org = orgRows[0];

  if (org && orgUsesSecretsStore(org) && isCloudflareRuntime()) {
    await upsertOrgSecretForOrganization({
      organizationId: params.organizationId,
      secretName: CCO_STORE_SECRET.CLOUDFLARE_API_TOKEN,
      value: apiToken,
      apiToken,
      configuredPatch: {
        cloudflareApiTokenConfigured: true,
        cloudflareApiTokenEnc: null,
        cloudflareAccountId: accountId,
      },
    });
    invalidateOrgContextCache();
    return { accountId };
  }

  await db
    .update(organizations)
    .set({
      cloudflareApiTokenEnc: encryptSecret(apiToken),
      cloudflareAccountId: accountId,
    })
    .where(eq(organizations.id, params.organizationId));

  invalidateOrgContextCache();

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

  await ensureCloudflareOrganizationColumns();
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

  invalidateOrgContextCache();

  return {
    createdApp: provisioned.createdApp,
    presetsResolved: provisioned.presets != null,
  };
}

/** Re-export for future first-time setup flow. */
export { provisionRealtimeKitFromApiToken } from "./cloudflare-realtimekit-provision";

/** Disable RealtimeKit calls while keeping the Cloudflare API token for other features. */
export async function disableOrganizationRealtimeKitCalls(organizationId: string): Promise<void> {
  await ensureCloudflareOrganizationColumns();
  await db
    .update(organizations)
    .set({
      realtimeKitAppId: null,
      realtimeKitPresetHost: null,
      realtimeKitPresetMember: null,
      realtimeKitPresetGuest: null,
    })
    .where(eq(organizations.id, organizationId));
  invalidateOrgContextCache();
}

type RealtimeKitOrganizationRow = {
  id: string;
  name: string;
  cloudflareAccountId: string | null;
  cloudflareApiTokenEnc: string | null;
  realtimeKitAppId: string | null;
  realtimeKitPresetHost: string | null;
  realtimeKitPresetMember: string | null;
  realtimeKitPresetGuest: string | null;
};

async function fetchRealtimeKitOrganizationRow(
  organizationId: string,
): Promise<RealtimeKitOrganizationRow | null> {
  await ensureCloudflareOrganizationColumns();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      cloudflareAccountId: organizations.cloudflareAccountId,
      cloudflareApiTokenEnc: organizations.cloudflareApiTokenEnc,
      realtimeKitAppId: organizations.realtimeKitAppId,
      realtimeKitPresetHost: organizations.realtimeKitPresetHost,
      realtimeKitPresetMember: organizations.realtimeKitPresetMember,
      realtimeKitPresetGuest: organizations.realtimeKitPresetGuest,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function enableOrganizationRealtimeKit(params: {
  organizationId: string;
  organizationName?: string;
  cloudflareApiToken?: string;
}): Promise<{ createdApp: boolean; presetsResolved: boolean; reconfigured: boolean }> {
  const row = await fetchRealtimeKitOrganizationRow(params.organizationId);
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

export function getOrganizationRealtimeKitStatus(
  org: Pick<
    typeof organizations.$inferSelect,
    | "cloudflareAccountId"
    | "cloudflareApiTokenEnc"
    | "cloudflareApiTokenConfigured"
    | "realtimeKitAppId"
    | "realtimeKitPresetHost"
    | "realtimeKitPresetMember"
    | "realtimeKitPresetGuest"
  >,
) {
  const presets = getPresetNames(org);
  const tokenConfigured = isCloudflareApiTokenConfigured(org);
  const callsFromDb = Boolean(org.realtimeKitAppId && tokenConfigured);
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
    cloudflareApiTokenConfigured: tokenConfigured || tokenFromEnv,
    /** @deprecated Use cloudflareApiTokenConfigured */
    realtimeKitTokenConfigured: tokenConfigured || tokenFromEnv,
    realtimeKitPresetsConfigured: Boolean(
      org.realtimeKitPresetHost && org.realtimeKitPresetMember && org.realtimeKitPresetGuest,
    ),
    realtimeKitPresetHost: presets.host,
    realtimeKitPresetMember: presets.member,
    realtimeKitPresetGuest: presets.guest,
  };
}
