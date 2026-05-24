import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { PcoApiError } from "@cco/pco-client";
import { db } from "../db";
import { groupMemberships, groups } from "../db/schema";
import { resolvePcoAccessToken } from "../auth/resolve-pco-token";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { listGroupsForSidebar } from "../services/conversations";
import { refreshMissingGroupImages } from "../services/group-profile";
import { areOrgWebhooksEnabled } from "../services/pco-cache";
import { mountGroupConversationRoutes } from "./conversations";
import { isLeaderRole } from "../permissions";
import {
  persistGroupSync,
  removeMemberFromGroupWithPco,
  syncGroupRoster,
} from "../services/group-sync";
import { syncPcoDataForUser } from "../services/pco-data-sync";

type Env = { Variables: AuthVariables };

export const groupsRouter = new Hono<Env>();

groupsRouter.use("*", requireAuth);

groupsRouter.get("/", async (c) => {
  try {
    const session = c.get("session");
    const rows = await db
      .select({
        id: groups.id,
        name: groups.name,
        pcoGroupId: groups.pcoGroupId,
        imageUrl: groups.imageUrl,
      })
      .from(groups)
      .innerJoin(groupMemberships, eq(groupMemberships.groupId, groups.id))
      .where(eq(groupMemberships.userId, session.userId));

    return c.json({ groups: rows });
  } catch (err) {
    console.error("GET /groups failed:", err);
    return c.json({ error: "Failed to load groups" }, 500);
  }
});

groupsRouter.get("/sidebar", async (c) => {
  try {
    const session = c.get("session");
    let groupsForSidebar = await listGroupsForSidebar(session.userId);

    const accessToken = await resolvePcoAccessToken(session, c);
    const webhooksEnabled = await areOrgWebhooksEnabled();
    if (accessToken && !webhooksEnabled) {
      groupsForSidebar = await refreshMissingGroupImages(groupsForSidebar, accessToken);
    }

    return c.json({ groups: groupsForSidebar });
  } catch (err) {
    console.error("GET /groups/sidebar failed:", err);
    return c.json({ error: "Failed to load groups sidebar" }, 500);
  }
});

groupsRouter.post("/sync", async (c) => {
  const session = c.get("session");
  const result = await syncPcoDataForUser(session, c);
  if ("status" in result) {
    return c.json(
      { error: result.error, needsReconnect: result.needsReconnect },
      result.status as 401 | 403 | 500 | 502,
    );
  }

  return c.json({
    synced: true,
    created: result.groups.created,
    updated: result.groups.updated,
    total: result.groups.total,
    rosterSync: result.groups.rosterSync,
    teams: result.teams,
  });
});

groupsRouter.post("/:id/roster/sync", async (c) => {
  const session = c.get("session");
  const groupId = c.req.param("id");

  const membership = await db
    .select({ role: groupMemberships.role, pcoGroupId: groups.pcoGroupId })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, session.userId)))
    .limit(1);

  if (!membership[0]) return c.json({ error: "Not found" }, 404);
  if (!isLeaderRole(membership[0].role)) {
    return c.json({ error: "Leader role required" }, 403);
  }

  const accessToken = await resolvePcoAccessToken(session, c);
  if (!accessToken) {
    return c.json({ error: "Planning Center is not linked", needsReconnect: true }, 401);
  }

  try {
    const result = await syncGroupRoster({
      organizationId: session.organizationId,
      groupId,
      pcoGroupId: membership[0].pcoGroupId,
      accessToken,
    });
    return c.json({ synced: true, upserted: result.upserted, removed: result.removed });
  } catch (err) {
    if (err instanceof PcoApiError) {
      return c.json({ error: err.message, needsReconnect: err.status === 401 }, 403);
    }
    console.error("roster sync failed:", err);
    return c.json({ error: "Roster sync failed" }, 500);
  }
});

groupsRouter.delete("/:id/members/:userId", async (c) => {
  const session = c.get("session");
  const groupId = c.req.param("id");
  const targetUserId = c.req.param("userId");

  if (targetUserId === session.userId) {
    return c.json({ error: "Use Planning Center to leave the group yourself" }, 400);
  }

  const membership = await db
    .select({ role: groupMemberships.role, pcoGroupId: groups.pcoGroupId })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, session.userId)))
    .limit(1);

  if (!membership[0]) return c.json({ error: "Not found" }, 404);
  if (!isLeaderRole(membership[0].role)) {
    return c.json({ error: "Leader role required" }, 403);
  }

  const accessToken = await resolvePcoAccessToken(session, c);
  if (!accessToken) {
    return c.json({ error: "Planning Center is not linked", needsReconnect: true }, 401);
  }

  try {
    const result = await removeMemberFromGroupWithPco({
      organizationId: session.organizationId,
      groupId,
      pcoGroupId: membership[0].pcoGroupId,
      targetUserId,
      accessToken,
    });
    return c.json({ removed: true, pcoRemoved: result.pcoRemoved });
  } catch (err) {
    if (err instanceof PcoApiError) {
      return c.json({ error: err.message, needsReconnect: err.status === 401 }, 403);
    }
    console.error("remove member failed:", err);
    return c.json({ error: "Failed to remove member" }, 500);
  }
});

mountGroupConversationRoutes(groupsRouter);
