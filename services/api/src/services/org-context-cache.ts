import { isNotNull } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptWebhookSecrets } from "../webhooks/secrets";
import { selectConfiguredOrganizationRow } from "./configured-org-query";
import type { ConfiguredOrganizationRow } from "./org-select";

const ORG_CACHE_TTL_MS = 60_000;

let cachedOrg: ConfiguredOrganizationRow | null | undefined;
let cachedOrgAt = 0;
let cachedWebhooksEnabled: boolean | null = null;
let cachedWebhooksAt = 0;

export function invalidateOrgContextCache(): void {
  cachedOrg = undefined;
  cachedOrgAt = 0;
  cachedWebhooksEnabled = null;
  cachedWebhooksAt = 0;
}

export async function getCachedConfiguredOrganization(): Promise<ConfiguredOrganizationRow | null> {
  const now = Date.now();
  if (cachedOrg !== undefined && now - cachedOrgAt < ORG_CACHE_TTL_MS) {
    return cachedOrg;
  }

  cachedOrg = await selectConfiguredOrganizationRow(isNotNull(organizations.setupCompletedAt));
  cachedOrgAt = now;
  cachedWebhooksEnabled = null;
  return cachedOrg;
}

export async function getCachedOrgWebhookSecrets(): Promise<string[]> {
  const rows = await db
    .select({ pcoWebhookSecretEnc: organizations.pcoWebhookSecretEnc })
    .from(organizations)
    .where(isNotNull(organizations.setupCompletedAt))
    .limit(1);

  return decryptWebhookSecrets(rows[0]?.pcoWebhookSecretEnc);
}

export async function areOrgWebhooksEnabledCached(): Promise<boolean> {
  const now = Date.now();
  if (cachedWebhooksEnabled !== null && now - cachedWebhooksAt < ORG_CACHE_TTL_MS) {
    return cachedWebhooksEnabled;
  }

  const secrets = await getCachedOrgWebhookSecrets();
  cachedWebhooksEnabled = secrets.length > 0;
  cachedWebhooksAt = now;
  return cachedWebhooksEnabled;
}
