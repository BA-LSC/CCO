import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { resolvePcoAccessToken } from "../auth/resolve-pco-token";
import { db } from "../db";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { canCreateConversation } from "../permissions";
import {
  archiveConversation,
  createConversation,
  getConversationMembers,
  getGroupWithConversations,
  setConversationMembers,
  markConversationRead,
  setConversationMuted,
  updateConversation,
} from "../services/conversations";
import { refreshGroupImageFromPco, refreshMissingGroupImages } from "../services/group-profile";
import { listGroupMembersForDetail, trySyncGroupRosterForLeader } from "../services/group-sync";
import { listMessages } from "../services/messages";
import { areOrgWebhooksEnabled } from "../services/pco-cache";

type Env = { Variables: AuthVariables };

export const conversationsRouter = new Hono<Env>();

conversationsRouter.use("*", requireAuth);

conversationsRouter.get("/:id/messages", async (c) => {
  const session = c.get("session");
  const conversationId = c.req.param("id");
  const before = c.req.query("before") ?? undefined;
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  const anchorUnread = c.req.query("anchorUnread") === "1";
  const result = await listMessages(conversationId, session.userId, {
    before,
    limit,
    anchorUnread,
  });
  if (!result) return c.json({ error: "Forbidden" }, 403);
  return c.json(result);
});

conversationsRouter.post("/:id/read", async (c) => {
  const session = c.get("session");
  const ok = await markConversationRead(c.req.param("id"), session.userId);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ read: true, hasUnread: false });
});

conversationsRouter.get("/:id/members", async (c) => {
  const session = c.get("session");
  const groupId = c.req.query("groupId");
  if (!groupId) return c.json({ error: "groupId required" }, 400);

  const members = await getConversationMembers({
    conversationId: c.req.param("id"),
    groupId,
    userId: session.userId,
  });
  if (!members) return c.json({ error: "Not found" }, 404);
  return c.json({ members });
});

const CreateConversationSchema = z.object({
  slug: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  leaderOnly: z.boolean().optional(),
  memberUserIds: z.array(z.string().uuid()).optional(),
});

const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  leaderOnly: z.boolean().optional(),
});

const MembersSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

const MuteSchema = z.object({ muted: z.boolean() });

conversationsRouter.patch("/:id", async (c) => {
  const session = c.get("session");
  const groupId = c.req.query("groupId");
  if (!groupId) return c.json({ error: "groupId required" }, 400);

  const body = UpdateConversationSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const ok = await updateConversation({
    conversationId: c.req.param("id"),
    groupId,
    userId: session.userId,
    title: body.data.title,
    leaderOnly: body.data.leaderOnly,
  });
  if (!ok) return c.json({ error: "Forbidden" }, 403);
  return c.json({ updated: true });
});

conversationsRouter.put("/:id/members", async (c) => {
  const session = c.get("session");
  const groupId = c.req.query("groupId");
  if (!groupId) return c.json({ error: "groupId required" }, 400);

  const group = await getGroupWithConversations(groupId, session.userId);
  if (!group) return c.json({ error: "Not found" }, 404);
  if (!canCreateConversation(group.membershipRole)) {
    return c.json({ error: "Leader role required" }, 403);
  }

  const body = MembersSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  await setConversationMembers({
    conversationId: c.req.param("id"),
    groupId,
    userIds: body.data.userIds,
  });

  const members = await getConversationMembers({
    conversationId: c.req.param("id"),
    groupId,
    userId: session.userId,
  });

  return c.json({ members: members ?? [] });
});

conversationsRouter.patch("/:id/mute", async (c) => {
  const session = c.get("session");
  const body = MuteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const ok = await setConversationMuted({
    conversationId: c.req.param("id"),
    userId: session.userId,
    muted: body.data.muted,
  });
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ muted: body.data.muted });
});

conversationsRouter.post("/:id/archive", async (c) => {
  const session = c.get("session");
  const conversationId = c.req.param("id");
  const groupId = c.req.query("groupId");
  if (!groupId) return c.json({ error: "groupId required" }, 400);

  const ok = await archiveConversation({
    conversationId,
    userId: session.userId,
    groupId,
  });
  if (!ok) return c.json({ error: "Forbidden" }, 403);
  return c.json({ archived: true });
});

export function mountGroupConversationRoutes(groupsRouter: Hono<Env>): void {
  groupsRouter.get("/:id", async (c) => {
    const session = c.get("session");
    const groupId = c.req.param("id");
    let result = await getGroupWithConversations(groupId, session.userId);
    if (!result) return c.json({ error: "Not found" }, 404);

    const accessToken = await resolvePcoAccessToken(session, c);
    const webhooksEnabled = await areOrgWebhooksEnabled();
    // Leaders can force a PCO roster pull with ?sync=1 (fallback when webhooks missed a delivery).
    const requestLiveSync = c.req.query("sync") === "1";
    const userRow = await db
      .select({ pcoPersonId: users.pcoPersonId })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (accessToken && userRow[0]) {
      if (!webhooksEnabled && !result.group.imageUrl) {
        try {
          const imageUrl = await refreshGroupImageFromPco({
            groupId,
            pcoGroupId: result.group.pcoGroupId,
            accessToken,
          });
          if (imageUrl) result = { ...result, group: { ...result.group, imageUrl } };
        } catch (err) {
          console.warn("Could not refresh group image from PCO:", err);
        }
      }

      if (requestLiveSync) {
        await trySyncGroupRosterForLeader({
          organizationId: session.organizationId,
          groupId,
          userId: session.userId,
          pcoPersonId: userRow[0].pcoPersonId,
          membershipRole: result.membershipRole,
          accessToken,
          pcoGroupId: result.group.pcoGroupId,
        });
        const updated = await getGroupWithConversations(groupId, session.userId);
        if (updated) result = updated;
      }
    }

    result = {
      ...result,
      members: await listGroupMembersForDetail({
        groupId,
        organizationId: session.organizationId,
        membershipRole: result.membershipRole,
        pcoGroupId: result.group.pcoGroupId,
        accessToken: accessToken ?? undefined,
        liveRoster: requestLiveSync,
      }),
    };

    return c.json(result);
  });

  groupsRouter.post("/:id/conversations", async (c) => {
    const session = c.get("session");
    const groupId = c.req.param("id");
    const body = CreateConversationSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);

    const group = await getGroupWithConversations(groupId, session.userId);
    if (!group) return c.json({ error: "Not found" }, 404);
    if (!canCreateConversation(group.membershipRole)) {
      return c.json({ error: "Leader role required" }, 403);
    }

    const id = await createConversation({
      groupId,
      slug: body.data.slug,
      title: body.data.title,
      leaderOnly: body.data.leaderOnly,
      memberUserIds: body.data.memberUserIds,
    });

    return c.json({ id }, 201);
  });
}
