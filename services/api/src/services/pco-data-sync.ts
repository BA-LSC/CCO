import type { Context } from "hono";
import { eq } from "drizzle-orm";
import {
  PcoApiError,
  PlanningCenterClient,
  enrichGroupsWithImages,
  fetchMyGroupRoles,
  fetchMyGroups,
} from "@cco/pco-client";
import type { SessionPayload } from "../auth/session";
import { resolvePcoAccessToken } from "../auth/resolve-pco-token";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import { persistGroupSync, syncLeaderGroupRosters } from "./group-sync";
import { invalidateOrgContextCache } from "./org-context-cache";
import { syncLeaderTeamRosters, syncServiceTeamsFromPco } from "./service-teams";

export type PcoDataSyncSuccess = {
  syncedAt: Date;
  groups: {
    created: number;
    updated: number;
    total: number;
    rosterSync: { groupsSynced: number; upserted: number };
  };
  teams: {
    created: number;
    removed: number;
    total: number;
    rosterSync: { teamsSynced: number; upserted: number };
  };
};

export type PcoDataSyncFailure = {
  error: string;
  needsReconnect?: boolean;
  status: number;
};

export async function syncPcoDataForUser(
  session: SessionPayload,
  c: Context,
): Promise<PcoDataSyncSuccess | PcoDataSyncFailure> {
  let accessToken: string | undefined;
  try {
    accessToken = await resolvePcoAccessToken(session, c);
  } catch (err) {
    console.error("resolvePcoAccessToken failed:", err);
    return { error: "Failed to read Planning Center credentials", status: 500 };
  }
  if (!accessToken) {
    return {
      error: "Planning Center is not linked. Reconnect Planning Center first.",
      needsReconnect: true,
      status: 401,
    };
  }

  try {
    const client = new PlanningCenterClient({ accessToken });
    const listed = await fetchMyGroups(client);
    const incoming = await enrichGroupsWithImages(client, listed);

    const userRow = await db
      .select({ pcoPersonId: users.pcoPersonId })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    let memberships: Awaited<ReturnType<typeof fetchMyGroupRoles>> = [];
    if (userRow[0]) {
      try {
        memberships = await fetchMyGroupRoles(client, userRow[0].pcoPersonId, incoming);
      } catch (err) {
        console.warn("Could not fetch PCO membership roles:", err);
      }
    }

    const groupResult = await persistGroupSync({
      organizationId: session.organizationId,
      userId: session.userId,
      incoming,
      memberships,
    });

    const groupRosterSync = await syncLeaderGroupRosters({
      organizationId: session.organizationId,
      userId: session.userId,
      accessToken,
    });

    let teamsResult = { created: 0, removed: 0, total: 0 };
    let teamRosterSync = { teamsSynced: 0, upserted: 0 };
    if (userRow[0]) {
      teamsResult = await syncServiceTeamsFromPco({
        organizationId: session.organizationId,
        userId: session.userId,
        accessToken,
        pcoPersonId: userRow[0].pcoPersonId,
      });
      teamRosterSync = await syncLeaderTeamRosters({
        organizationId: session.organizationId,
        userId: session.userId,
        accessToken,
      });
    }

    const syncedAt = new Date();
    await db
      .update(organizations)
      .set({ pcoLastSyncedAt: syncedAt })
      .where(eq(organizations.id, session.organizationId));
    invalidateOrgContextCache();

    return {
      syncedAt,
      groups: {
        created: groupResult.created,
        updated: groupResult.updated,
        total: incoming.length,
        rosterSync: groupRosterSync,
      },
      teams: {
        ...teamsResult,
        rosterSync: teamRosterSync,
      },
    };
  } catch (err) {
    if (err instanceof PcoApiError) {
      const status = err.status === 401 || err.status === 403 ? 403 : 502;
      return {
        error: err.message,
        needsReconnect: status === 403,
        status,
      };
    }
    console.error("PCO data sync failed:", err);
    const message = err instanceof Error ? err.message : "Planning Center sync failed";
    return { error: message, status: 500 };
  }
}
