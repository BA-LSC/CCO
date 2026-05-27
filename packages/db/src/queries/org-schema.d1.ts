/**
 * D1 schema is provisioned via baseline migration — no runtime DDL needed.
 * Postgres VPS path uses services/api/src/services/org-schema-capabilities.ts instead.
 */

/** No-op: Cloudflare org columns exist in D1 baseline migration. */
export async function ensureCloudflareOrganizationColumns(): Promise<void> {}

/** @deprecated Alias — D1 baseline includes platform columns. */
export async function ensureCloudflarePlatformColumns(): Promise<void> {
  await ensureCloudflareOrganizationColumns();
}

/** No-op: call tables exist in D1 baseline migration. */
export async function ensureCallSessionSchema(): Promise<void> {}

/** Call participant schema is always present after D1 baseline migration. */
export async function callParticipantsTableExists(): Promise<boolean> {
  return true;
}

/** No-op on D1. */
export async function ensureExtendedOrganizationSchema(): Promise<void> {
  await ensureCloudflareOrganizationColumns();
  await ensureCallSessionSchema();
}

/** @deprecated D1 always has extended org columns after baseline migration. */
export async function hasExtendedOrganizationColumns(): Promise<boolean> {
  return true;
}

export function resetExtendedOrganizationColumnsCache(): void {
  // Postgres-only in-memory cache; nothing to reset on D1.
}
