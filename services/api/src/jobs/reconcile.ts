import { eq, inArray, lt } from "drizzle-orm";
import {
  enrichGroupsWithImages,
  PlanningCenterClient,
  fetchMyGroupRoles,
  fetchMyGroups,
} from "@cco/pco-client";
import { db } from "../db";
import { groupMemberships, organizations, userPcoCredentials, users } from "../db/schema";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { persistGroupSync } from "../services/group-sync";
import { getConfiguredOrganization } from "../services/org-oauth";
import { invalidateOrgContextCache } from "../services/org-context-cache";

const STALE_DAYS = 7;
export const RECONCILE_BATCH_SIZE = 8;

export type ReconcileUserContext = {
  userId: string;
  organizationId: string;
  pcoPersonId: string;
  accessToken: string;
};

export async function loadReconcileUserContexts(): Promise<ReconcileUserContext[]> {
  const creds = await db.select({ userId: userPcoCredentials.userId }).from(userPcoCredentials);
  if (creds.length === 0) return [];

  const userIds = creds.map((row) => row.userId);
  const userRows = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      pcoPersonId: users.pcoPersonId,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  const userById = new Map(userRows.map((row) => [row.id, row]));
  const contexts: ReconcileUserContext[] = [];

  for (const { userId } of creds) {
    const userRow = userById.get(userId);
    if (!userRow) continue;
    const accessToken = await getPcoAccessToken(userId);
    if (!accessToken) continue;
    contexts.push({
      userId,
      organizationId: userRow.organizationId,
      pcoPersonId: userRow.pcoPersonId,
      accessToken,
    });
  }

  return contexts;
}

export async function reconcileUserContext(context: ReconcileUserContext): Promise<boolean> {
  try {
    const client = new PlanningCenterClient({ accessToken: context.accessToken });
    const listed = await fetchMyGroups(client);
    const incoming = await enrichGroupsWithImages(client, listed);
    const memberships = await fetchMyGroupRoles(client, context.pcoPersonId, incoming);
    await persistGroupSync({
      organizationId: context.organizationId,
      userId: context.userId,
      incoming,
      memberships,
    });
    return true;
  } catch (err) {
    console.warn(`Reconcile sync failed for user ${context.userId}:`, err);
    return false;
  }
}

export async function reconcileUserContextsBatch(
  contexts: ReconcileUserContext[],
  batchSize = RECONCILE_BATCH_SIZE,
  syncUser: (context: ReconcileUserContext) => Promise<boolean> = reconcileUserContext,
): Promise<number> {
  let resynced = 0;
  for (let index = 0; index < contexts.length; index += batchSize) {
    const batch = contexts.slice(index, index + batchSize);
    const results = await Promise.allSettled(batch.map((context) => syncUser(context)));
    resynced += results.filter((result) => result.status === "fulfilled" && result.value).length;
  }
  return resynced;
}

/** Re-sync groups for users with stored PCO tokens; remove memberships stale >7 days with no token refresh. */
export async function reconcileStaleMemberships(): Promise<{
  removed: number;
  resynced: number;
  skipped?: boolean;
}> {
  const org = await getConfiguredOrganization();
  if (org?.pcoNightlySyncEnabled === false) {
    return { removed: 0, resynced: 0, skipped: true };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);

  const contexts = await loadReconcileUserContexts();
  const resynced = await reconcileUserContextsBatch(contexts);

  const stale = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(lt(groupMemberships.syncedAt, cutoff));

  let removed = 0;
  if (stale.length > 0) {
    const staleIds = stale.map((row) => row.id);
    await db.transaction(async (tx) => {
      await tx.delete(groupMemberships).where(inArray(groupMemberships.id, staleIds));
    });
    removed = staleIds.length;
  }

  if (org) {
    await db
      .update(organizations)
      .set({ pcoLastSyncedAt: new Date() })
      .where(eq(organizations.id, org.id));
    invalidateOrgContextCache();
  }

  return { removed, resynced };
}
