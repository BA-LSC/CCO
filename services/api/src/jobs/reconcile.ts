import { eq, lt } from "drizzle-orm";
import {
  enrichGroupsWithImages,
  PlanningCenterClient,
  fetchMyGroupRoles,
  fetchMyGroups,
} from "@cco/pco-client";
import { db } from "../db";
import { groupMemberships, userPcoCredentials, users } from "../db/schema";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { persistGroupSync } from "../services/group-sync";

const STALE_DAYS = 7;

/** Re-sync groups for users with stored PCO tokens; remove memberships stale >7 days with no token refresh. */
export async function reconcileStaleMemberships(): Promise<{
  removed: number;
  resynced: number;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);

  const creds = await db.select({ userId: userPcoCredentials.userId }).from(userPcoCredentials);
  let resynced = 0;

  for (const { userId } of creds) {
    const accessToken = await getPcoAccessToken(userId);
    if (!accessToken) continue;

    const userRow = await db
      .select({ organizationId: users.organizationId, pcoPersonId: users.pcoPersonId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow[0]) continue;

    try {
      const client = new PlanningCenterClient({ accessToken });
      const listed = await fetchMyGroups(client);
      const incoming = await enrichGroupsWithImages(client, listed);
      const memberships = await fetchMyGroupRoles(client, userRow[0].pcoPersonId, incoming);
      await persistGroupSync({
        organizationId: userRow[0].organizationId,
        userId,
        incoming,
        memberships,
      });
      resynced += 1;
    } catch (err) {
      console.warn(`Reconcile sync failed for user ${userId}:`, err);
    }
  }

  const stale = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(lt(groupMemberships.syncedAt, cutoff));

  if (stale.length === 0) return { removed: 0, resynced };

  for (const row of stale) {
    await db.delete(groupMemberships).where(eq(groupMemberships.id, row.id));
  }

  return { removed: stale.length, resynced };
}
