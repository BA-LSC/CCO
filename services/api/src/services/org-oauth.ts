import { DEFAULT_PCO_OAUTH_SCOPE } from "@cco/pco-client";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { encryptWebhookSecretsInput } from "../webhooks/secrets";
import {
  getCachedConfiguredOrganization,
  invalidateOrgContextCache,
} from "./org-context-cache";
import { selectConfiguredOrganizationRow } from "./configured-org-query";

export type OrgOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  scope: string;
};

function envBootstrapCredentials(): OrgOAuthCredentials | null {
  const clientId = process.env.PCO_CLIENT_ID?.trim();
  const clientSecret = process.env.PCO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    scope: process.env.PCO_OAUTH_SCOPE ?? DEFAULT_PCO_OAUTH_SCOPE,
  };
}

function credentialsFromOrg(org: typeof organizations.$inferSelect): OrgOAuthCredentials | null {
  if (!org.pcoClientId || !org.pcoClientSecretEnc) return null;
  return {
    clientId: org.pcoClientId,
    clientSecret: decryptSecret(org.pcoClientSecretEnc),
    scope: org.pcoOauthScope ?? DEFAULT_PCO_OAUTH_SCOPE,
  };
}

export async function getConfiguredOrganization() {
  return getCachedConfiguredOrganization();
}

export async function getOrganizationWithOAuthCredentials() {
  const completed = await getConfiguredOrganization();
  if (completed?.pcoClientId && completed.pcoClientSecretEnc) {
    return completed;
  }

  const rows = await selectConfiguredOrganizationRow(
    and(isNotNull(organizations.pcoClientId), isNotNull(organizations.pcoClientSecretEnc)),
  );
  return rows;
}

export async function getPendingSetupOrganization() {
  return selectConfiguredOrganizationRow(isNull(organizations.setupCompletedAt));
}

export function draftHasSensitiveData(org: typeof organizations.$inferSelect): boolean {
  return Boolean(org.pcoClientId || org.pcoClientSecretEnc);
}

export async function isSetupComplete(): Promise<boolean> {
  const org = await getConfiguredOrganization();
  return Boolean(org?.setupCompletedAt && org.pcoClientId && org.pcoClientSecretEnc);
}

export async function getActiveOrgOAuthCredentials(): Promise<OrgOAuthCredentials | null> {
  const org = await getOrganizationWithOAuthCredentials();
  if (!org) return null;
  return credentialsFromOrg(org);
}

export function hasBootstrapOAuth(): boolean {
  return envBootstrapCredentials() !== null;
}

export async function saveSetupDraft(params: {
  name: string;
  clientId: string;
  clientSecret: string;
  signInRedirectUri: string;
  webhookUrl: string;
  webhookSecret?: string | null;
}): Promise<void> {
  const scope = DEFAULT_PCO_OAUTH_SCOPE;
  const clientId = params.clientId.trim();
  const clientSecretEnc = encryptSecret(params.clientSecret.trim());
  const webhookEnc = encryptWebhookSecretsInput(params.webhookSecret);
  const signInRedirectUri = params.signInRedirectUri.trim();
  const webhookUrl = params.webhookUrl.trim();

  const pending = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.setupCompletedAt))
    .limit(1);

  if (pending[0]) {
    await db
      .update(organizations)
      .set({
        name: params.name.trim(),
        pcoClientId: clientId,
        pcoClientSecretEnc: clientSecretEnc,
        pcoOauthScope: scope,
        pcoWebhookSecretEnc: webhookEnc,
        pcoWebRedirectUri: signInRedirectUri,
        pcoWebhookUrl: webhookUrl,
      })
      .where(eq(organizations.id, pending[0].id));
    invalidateOrgContextCache();
    return;
  }

  await db.insert(organizations).values({
    name: params.name.trim(),
    pcoOrganizationId: `pending-${randomUUID()}`,
    pcoClientId: clientId,
    pcoClientSecretEnc: clientSecretEnc,
    pcoOauthScope: scope,
    pcoWebhookSecretEnc: webhookEnc,
    pcoWebRedirectUri: signInRedirectUri,
    pcoWebhookUrl: webhookUrl,
  });
  invalidateOrgContextCache();
}

export async function completeOrganizationSetup(params: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  await db
    .update(organizations)
    .set({
      setupCompletedAt: new Date(),
      setupByUserId: params.userId,
      setupSessionTokenHash: null,
    })
    .where(eq(organizations.id, params.organizationId));
  invalidateOrgContextCache();

  const { ensureVapidKeys } = await import("./org-vapid");
  await ensureVapidKeys(params.organizationId);
}

/** @deprecated use saveSetupDraft */
export async function saveBootstrapOAuthCredentials(params: {
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  const { getDefaultPcoWebRedirectUri, getDefaultPcoWebhookUrl } = await import(
    "../auth/pco-redirect-uris"
  );
  await saveSetupDraft({
    name: "Pending setup",
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    signInRedirectUri: getDefaultPcoWebRedirectUri(),
    webhookUrl: getDefaultPcoWebhookUrl(),
  });
}

export async function saveOrganizationOAuthSetup(params: {
  organizationId: string;
  userId: string;
  name: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  churchCenterSubdomain?: string | null;
  webhookSecret?: string | null;
}): Promise<void> {
  const existing = await db
    .select({ pcoClientSecretEnc: organizations.pcoClientSecretEnc })
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);

  const secretEnc = params.clientSecret?.trim()
    ? encryptSecret(params.clientSecret.trim())
    : existing[0]?.pcoClientSecretEnc;
  if (!secretEnc) {
    throw new Error("OAuth client secret is required");
  }

  await db
    .update(organizations)
    .set({
      name: params.name,
      pcoClientId: params.clientId.trim(),
      pcoClientSecretEnc: secretEnc,
      pcoOauthScope: params.scope?.trim() || DEFAULT_PCO_OAUTH_SCOPE,
      pcoWebhookSecretEnc: encryptWebhookSecretsInput(params.webhookSecret),
      churchCenterSubdomain: params.churchCenterSubdomain?.trim() || null,
      setupCompletedAt: new Date(),
      setupByUserId: params.userId,
    })
    .where(eq(organizations.id, params.organizationId));
  invalidateOrgContextCache();

  const { ensureVapidKeys } = await import("./org-vapid");
  await ensureVapidKeys(params.organizationId);
}

export async function updateOrganizationOAuthSettings(params: {
  organizationId: string;
  name?: string;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  signInRedirectUri?: string;
  webhookUrl?: string;
}): Promise<void> {
  const updates: {
    name?: string;
    pcoClientId?: string;
    pcoClientSecretEnc?: string;
    pcoWebhookSecretEnc?: string | null;
    pcoWebRedirectUri?: string;
    pcoWebhookUrl?: string;
  } = {};

  if (params.name !== undefined) {
    updates.name = params.name.trim();
  }
  if (params.clientId !== undefined) {
    updates.pcoClientId = params.clientId.trim();
  }
  if (params.clientSecret !== undefined) {
    updates.pcoClientSecretEnc = encryptSecret(params.clientSecret.trim());
  }
  if (params.webhookSecret !== undefined) {
    updates.pcoWebhookSecretEnc = encryptWebhookSecretsInput(params.webhookSecret);
  }
  if (params.signInRedirectUri !== undefined) {
    updates.pcoWebRedirectUri = params.signInRedirectUri.trim();
  }
  if (params.webhookUrl !== undefined) {
    updates.pcoWebhookUrl = params.webhookUrl.trim();
  }

  if (Object.keys(updates).length === 0) return;

  await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, params.organizationId));
  invalidateOrgContextCache();
}
