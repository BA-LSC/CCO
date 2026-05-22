import { areOrgWebhooksEnabledCached } from "./org-context-cache";

/** How long cached PCO membership data stays fresh without webhooks. */
export const PCO_MEMBERSHIP_STALE_MS = 24 * 60 * 60 * 1000;

export async function areOrgWebhooksEnabled(): Promise<boolean> {
  return areOrgWebhooksEnabledCached();
}

export function isSyncedAtStale(
  syncedAt: Date,
  maxAgeMs: number = PCO_MEMBERSHIP_STALE_MS,
): boolean {
  return Date.now() - syncedAt.getTime() > maxAgeMs;
}

/** True when we should pull membership lists from PCO instead of the DB cache. */
export async function shouldRefreshMembershipFromPco(
  syncedAt: Date | null | undefined,
): Promise<boolean> {
  if (await areOrgWebhooksEnabled()) return false;
  if (!syncedAt) return true;
  return isSyncedAtStale(syncedAt);
}

export function parseServiceTypeNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function serializeServiceTypeNames(names: string[]): string | null {
  if (names.length === 0) return null;
  return JSON.stringify(names);
}
