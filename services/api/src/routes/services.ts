import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { PcoApiError, PlanningCenterClient, fetchServiceTypesForTeam } from "@cco/pco-client";
import { resolvePcoAccessToken } from "../auth/resolve-pco-token";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { db } from "../db";
import { serviceTeamMemberships, serviceTeams, users } from "../db/schema";
import { isLeaderRole } from "../permissions";
import {
  getServiceTeamDetail,
  listServiceTeamsForUser,
  removeMemberFromServiceTeamWithPco,
  syncServiceTeamRoster,
  syncServiceTeamsFromPco,
  trySyncServiceTeamRosterForLeader,
} from "../services/service-teams";

type Env = { Variables: AuthVariables };

export const servicesRouter = new Hono<Env>();

servicesRouter.use("*", requireAuth);

async function refreshTeamsFromPco(
  session: { userId: string; organizationId: string; pcoAccessToken?: string },
  c: Context,
): Promise<void> {
  const accessToken = await resolvePcoAccessToken(session, c);
  if (!accessToken) return;

  const userRow = await db
    .select({ pcoPersonId: users.pcoPersonId })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!userRow[0]) return;

  await syncServiceTeamsFromPco({
    organizationId: session.organizationId,
    userId: session.userId,
    accessToken,
    pcoPersonId: userRow[0].pcoPersonId,
  });
}

async function enrichTeamsWithServiceTypes<
  T extends { pcoTeamId: string },
>(teams: T[], session: { userId: string; pcoAccessToken?: string }, c: Context): Promise<
  (T & { serviceTypeNames: string[] })[]
> {
  try {
    const accessToken = await resolvePcoAccessToken(session, c);
    if (!accessToken) {
      return teams.map((team) => ({ ...team, serviceTypeNames: [] }));
    }

    const client = new PlanningCenterClient({ accessToken });
    return Promise.all(
      teams.map(async (team) => ({
        ...team,
        serviceTypeNames: await fetchServiceTypesForTeam(client, team.pcoTeamId).catch(() => []),
      })),
    );
  } catch (err) {
    console.warn(
      "Service type lookup failed:",
      err instanceof Error ? err.message : err,
    );
    return teams.map((team) => ({ ...team, serviceTypeNames: [] }));
  }
}

servicesRouter.get("/teams", async (c) => {
  const session = c.get("session");

  try {
    await refreshTeamsFromPco(session, c);
  } catch (err) {
    console.warn("Team refresh on list failed:", err instanceof Error ? err.message : err);
  }

  const teams = await listServiceTeamsForUser(session.userId);
  const teamsWithServiceTypes = await enrichTeamsWithServiceTypes(teams, session, c);
  return c.json({ teams: teamsWithServiceTypes });
});

servicesRouter.get("/teams/:id", async (c) => {
  const session = c.get("session");
  const teamId = c.req.param("id");
  const accessToken = await resolvePcoAccessToken(session, c);
  let detail = await getServiceTeamDetail(teamId, session.userId, {
    accessToken: accessToken ?? undefined,
    organizationId: session.organizationId,
  });
  if (!detail) return c.json({ error: "Not found" }, 404);

  if (accessToken && c.req.query("sync") === "1") {
    const synced = await trySyncServiceTeamRosterForLeader({
      organizationId: session.organizationId,
      teamId,
      pcoTeamId: detail.team.pcoTeamId,
      userId: session.userId,
      membershipRole: detail.membershipRole,
      accessToken,
    });
    if (synced) {
      const updated = await getServiceTeamDetail(teamId, session.userId, {
        accessToken,
        organizationId: session.organizationId,
      });
      if (updated) detail = updated;
    }
  }

  let serviceTypeNames: string[] = [];
  try {
    if (accessToken) {
      const client = new PlanningCenterClient({ accessToken });
      serviceTypeNames = await fetchServiceTypesForTeam(client, detail.team.pcoTeamId);
    }
  } catch (err) {
    console.warn(
      "Service type lookup failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return c.json({ ...detail, serviceTypeNames });
});

servicesRouter.post("/teams/sync", async (c) => {
  const session = c.get("session");

  try {
    await refreshTeamsFromPco(session, c);
    const teams = await listServiceTeamsForUser(session.userId);
    return c.json({ synced: true, total: teams.length });
  } catch (err) {
    if (err instanceof PcoApiError) {
      const status = err.status === 401 || err.status === 403 ? 403 : 502;
      return c.json({ error: err.message }, status);
    }
    const message = err instanceof Error ? err.message : "Planning Center sync failed";
    return c.json({ error: message }, 502);
  }
});

servicesRouter.post("/teams/:id/roster/sync", async (c) => {
  const session = c.get("session");
  const teamId = c.req.param("id");

  const membership = await db
    .select({ role: serviceTeamMemberships.role, pcoTeamId: serviceTeams.pcoTeamId })
    .from(serviceTeamMemberships)
    .innerJoin(serviceTeams, eq(serviceTeams.id, serviceTeamMemberships.teamId))
    .where(
      and(eq(serviceTeamMemberships.teamId, teamId), eq(serviceTeamMemberships.userId, session.userId)),
    )
    .limit(1);

  if (!membership[0]) return c.json({ error: "Not found" }, 404);
  if (!isLeaderRole(membership[0].role)) {
    return c.json({ error: "Team leader role required" }, 403);
  }

  const accessToken = await resolvePcoAccessToken(session, c);
  if (!accessToken) {
    return c.json({ error: "Planning Center is not linked", needsReconnect: true }, 401);
  }

  try {
    const result = await syncServiceTeamRoster({
      organizationId: session.organizationId,
      teamId,
      pcoTeamId: membership[0].pcoTeamId,
      accessToken,
    });
    return c.json({ synced: true, upserted: result.upserted, removed: result.removed });
  } catch (err) {
    if (err instanceof PcoApiError) {
      return c.json({ error: err.message, needsReconnect: err.status === 401 }, 403);
    }
    console.error("team roster sync failed:", err);
    return c.json({ error: "Roster sync failed" }, 500);
  }
});

servicesRouter.delete("/teams/:id/members/:userId", async (c) => {
  const session = c.get("session");
  const teamId = c.req.param("id");
  const targetUserId = c.req.param("userId");

  if (targetUserId === session.userId) {
    return c.json({ error: "Use Planning Center to leave the team yourself" }, 400);
  }

  const actorMembership = await db
    .select({ role: serviceTeamMemberships.role, pcoTeamId: serviceTeams.pcoTeamId })
    .from(serviceTeamMemberships)
    .innerJoin(serviceTeams, eq(serviceTeams.id, serviceTeamMemberships.teamId))
    .where(
      and(eq(serviceTeamMemberships.teamId, teamId), eq(serviceTeamMemberships.userId, session.userId)),
    )
    .limit(1);

  if (!actorMembership[0]) return c.json({ error: "Not found" }, 404);
  if (!isLeaderRole(actorMembership[0].role)) {
    return c.json({ error: "Team leader role required" }, 403);
  }

  const accessToken = await resolvePcoAccessToken(session, c);
  if (!accessToken) {
    return c.json({ error: "Missing PCO access token. Sign in again." }, 401);
  }

  try {
    const result = await removeMemberFromServiceTeamWithPco({
      teamId,
      pcoTeamId: actorMembership[0].pcoTeamId,
      targetUserId,
      accessToken,
    });
    return c.json({ removed: true, pcoRemoved: result.pcoRemoved });
  } catch (err) {
    if (err instanceof PcoApiError) {
      const status = err.status === 401 || err.status === 403 ? 403 : 502;
      return c.json({ error: err.message }, status);
    }
    const message = err instanceof Error ? err.message : "Failed to remove team member";
    return c.json({ error: message }, 500);
  }
});
