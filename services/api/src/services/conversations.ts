import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  groupMemberships,
  groups,
  users,
} from "../db/schema";
import { canPostInConversation, isLeaderRole } from "../permissions";
import { publishMessageEvent, publishMessageEventToMembers } from "../realtime/pubsub";
import { unreadFlagsForConversations } from "./unread";

export async function listConversationMemberUserIds(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return rows.map((row) => row.userId);
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const readAt = new Date();
  const updated = await db
    .update(conversationMembers)
    .set({ lastReadAt: readAt })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .returning({ id: conversationMembers.id });

  if (updated[0]) {
    await publishMessageEvent({
      type: "conversation.read",
      conversationId,
      userId,
      readAt: readAt.toISOString(),
    });
  }

  return Boolean(updated[0]);
}

export async function ensureGeneralConversation(groupId: string): Promise<string> {
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.groupId, groupId), eq(conversations.slug, "general")))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(conversations)
    .values({
      groupId,
      slug: "general",
      title: "General",
    })
    .returning({ id: conversations.id });

  return created.id;
}

export async function ensureConversationMember(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(conversationMembers)
    .values({ conversationId, userId })
    .onConflictDoNothing();
}

export async function ensureConversationMembers(
  conversationId: string,
  groupId: string,
): Promise<void> {
  const members = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(eq(groupMemberships.groupId, groupId));

  for (const member of members) {
    await db
      .insert(conversationMembers)
      .values({ conversationId, userId: member.userId })
      .onConflictDoNothing();
  }
}

export async function ensureGeneralConversationMembers(groupId: string): Promise<void> {
  const generalId = await ensureGeneralConversation(groupId);
  await ensureConversationMembers(generalId, groupId);
}

export async function createConversation(params: {
  groupId: string;
  slug: string;
  title: string;
  leaderOnly?: boolean;
  memberUserIds?: string[];
}): Promise<string> {
  const [created] = await db
    .insert(conversations)
    .values({
      groupId: params.groupId,
      slug: params.slug,
      title: params.title,
      leaderOnly: params.leaderOnly ?? false,
    })
    .returning({ id: conversations.id });

  if (params.memberUserIds && params.memberUserIds.length > 0) {
    await setConversationMembers({
      conversationId: created.id,
      groupId: params.groupId,
      userIds: params.memberUserIds,
    });
  } else {
    await ensureConversationMembers(created.id, params.groupId);
  }

  return created.id;
}

async function assertLeaderOfGroup(groupId: string, userId: string): Promise<string | null> {
  const membership = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)))
    .limit(1);

  if (!membership[0] || !isLeaderRole(membership[0].role)) return null;
  return membership[0].role;
}

export async function updateConversation(params: {
  conversationId: string;
  groupId: string;
  userId: string;
  title?: string;
  leaderOnly?: boolean;
}): Promise<boolean> {
  if (!(await assertLeaderOfGroup(params.groupId, params.userId))) return false;

  const conv = await db
    .select({ slug: conversations.slug })
    .from(conversations)
    .where(and(eq(conversations.id, params.conversationId), eq(conversations.groupId, params.groupId)))
    .limit(1);

  if (!conv[0]) return false;

  const updates: { title?: string; leaderOnly?: boolean } = {};
  if (params.title !== undefined && conv[0].slug !== "general") {
    updates.title = params.title;
  }
  if (params.leaderOnly !== undefined) updates.leaderOnly = params.leaderOnly;

  if (Object.keys(updates).length === 0) return true;

  await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, params.conversationId));

  const memberUserIds = await listConversationMemberUserIds(params.conversationId);
  await publishMessageEventToMembers(
    {
      type: "conversation.updated",
      conversationId: params.conversationId,
      ...(updates.leaderOnly !== undefined ? { leaderOnly: updates.leaderOnly } : {}),
      ...(updates.title !== undefined ? { title: updates.title } : {}),
    },
    memberUserIds,
  );

  return true;
}

export async function getConversationMembers(params: {
  conversationId: string;
  groupId: string;
  userId: string;
}): Promise<Array<{ id: string; displayName: string; role: string }> | null> {
  const isMember = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, params.groupId), eq(groupMemberships.userId, params.userId)))
    .limit(1);

  if (!isMember[0]) return null;

  const conv = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.id, params.conversationId), eq(conversations.groupId, params.groupId)),
    )
    .limit(1);

  if (!conv[0]) return null;

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: groupMemberships.role,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .innerJoin(
      groupMemberships,
      and(
        eq(groupMemberships.groupId, params.groupId),
        eq(groupMemberships.userId, conversationMembers.userId),
      ),
    )
    .where(eq(conversationMembers.conversationId, params.conversationId));

  return rows;
}

export async function setConversationMembers(params: {
  conversationId: string;
  groupId: string;
  userIds: string[];
}): Promise<void> {
  const conv = await db
    .select({ slug: conversations.slug })
    .from(conversations)
    .where(and(eq(conversations.id, params.conversationId), eq(conversations.groupId, params.groupId)))
    .limit(1);

  if (!conv[0]) return;

  const groupMemberRows = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(eq(groupMemberships.groupId, params.groupId));

  const groupMemberIds = new Set(groupMemberRows.map((r) => r.userId));
  const allowed = params.userIds.filter((id) => groupMemberIds.has(id));

  if (conv[0].slug === "general") {
    await ensureConversationMembers(params.conversationId, params.groupId);
    return;
  }

  const existing = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, params.conversationId));

  const targetSet = new Set(allowed);
  for (const row of existing) {
    if (!targetSet.has(row.userId)) {
      await db
        .delete(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, params.conversationId),
            eq(conversationMembers.userId, row.userId),
          ),
        );
    }
  }

  for (const userId of allowed) {
    await db
      .insert(conversationMembers)
      .values({ conversationId: params.conversationId, userId })
      .onConflictDoNothing();
  }
}

export async function listGroupsForSidebar(userId: string) {
  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      pcoGroupId: groups.pcoGroupId,
      imageUrl: groups.imageUrl,
      membershipRole: groupMemberships.role,
    })
    .from(groups)
    .innerJoin(groupMemberships, eq(groupMemberships.groupId, groups.id))
    .where(eq(groupMemberships.userId, userId));

  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id);

  const convRows = await db
    .select({
      id: conversations.id,
      slug: conversations.slug,
      title: conversations.title,
      leaderOnly: conversations.leaderOnly,
      groupId: conversations.groupId,
    })
    .from(conversations)
    .where(and(inArray(conversations.groupId, groupIds), isNull(conversations.archivedAt)));

  const convIds = convRows.map((c) => c.id);
  const mutedByConv = new Map<string, boolean>();
  const unreadByConv =
    convIds.length > 0 ? await unreadFlagsForConversations(convIds, userId) : new Map();

  const groupMemberCountByGroup = new Map<string, number>();
  const convMemberCountByConv = new Map<string, number>();

  const groupMemberCounts = await db
    .select({
      groupId: groupMemberships.groupId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(groupMemberships)
    .where(inArray(groupMemberships.groupId, groupIds))
    .groupBy(groupMemberships.groupId);

  for (const row of groupMemberCounts) {
    groupMemberCountByGroup.set(row.groupId, row.count);
  }

  if (convIds.length > 0) {
    const mutedRows = await db
      .select({
        conversationId: conversationMembers.conversationId,
        muted: conversationMembers.muted,
      })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.userId, userId),
          inArray(conversationMembers.conversationId, convIds),
        ),
      );

    for (const row of mutedRows) {
      mutedByConv.set(row.conversationId, row.muted);
    }

    const convMemberCounts = await db
      .select({
        conversationId: conversationMembers.conversationId,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(conversationMembers)
      .where(inArray(conversationMembers.conversationId, convIds))
      .groupBy(conversationMembers.conversationId);

    for (const row of convMemberCounts) {
      convMemberCountByConv.set(row.conversationId, row.count);
    }
  }

  const convsByGroup = new Map<string, typeof convRows>();
  for (const conv of convRows) {
    if (!conv.groupId) continue;
    const list = convsByGroup.get(conv.groupId) ?? [];
    list.push(conv);
    convsByGroup.set(conv.groupId, list);
  }

  return groupRows.map((group) => ({
    id: group.id,
    name: group.name,
    pcoGroupId: group.pcoGroupId,
    imageUrl: group.imageUrl,
    membershipRole: group.membershipRole,
    conversations: (convsByGroup.get(group.id) ?? []).map((conv) => {
      const groupMemberCount = groupMemberCountByGroup.get(group.id) ?? 0;
      const convMemberCount = convMemberCountByConv.get(conv.id) ?? 0;
      const hasRestrictedAccess =
        conv.slug !== "general" &&
        groupMemberCount > 0 &&
        convMemberCount > 0 &&
        convMemberCount < groupMemberCount;

      return {
        id: conv.id,
        slug: conv.slug,
        title: conv.title,
        leaderOnly: conv.leaderOnly,
        hasRestrictedAccess,
        muted: mutedByConv.get(conv.id) ?? false,
        hasUnread: unreadByConv.get(conv.id) ?? false,
      };
    }),
  }));
}

export async function getGroupWithConversations(groupId: string, userId: string) {
  const membership = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)))
    .limit(1);

  if (!membership[0]) return null;

  const group = await db
    .select({
      id: groups.id,
      name: groups.name,
      pcoGroupId: groups.pcoGroupId,
      imageUrl: groups.imageUrl,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group[0]) return null;

  const convs = await db
    .select({
      id: conversations.id,
      slug: conversations.slug,
      title: conversations.title,
      leaderOnly: conversations.leaderOnly,
      archivedAt: conversations.archivedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.groupId, groupId), isNull(conversations.archivedAt)));

  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(eq(groupMemberships.groupId, groupId));

  const convIds = convs.map((c) => c.id);

  const mutedRows =
    convIds.length > 0
      ? await db
          .select({
            conversationId: conversationMembers.conversationId,
            muted: conversationMembers.muted,
          })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.userId, userId),
              inArray(conversationMembers.conversationId, convIds),
            ),
          )
      : [];

  const mutedByConv = new Map(mutedRows.map((r) => [r.conversationId, r.muted]));
  const memberCountByConv = new Map<string, number>();

  if (convIds.length > 0 && isLeaderRole(membership[0].role)) {
    const counts = await db
      .select({
        conversationId: conversationMembers.conversationId,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(conversationMembers)
      .where(inArray(conversationMembers.conversationId, convIds))
      .groupBy(conversationMembers.conversationId);

    for (const row of counts) {
      memberCountByConv.set(row.conversationId, row.count);
    }
  }

  return {
    group: group[0],
    membershipRole: membership[0].role,
    conversations: convs.map((conv) => ({
      ...conv,
      muted: mutedByConv.get(conv.id) ?? false,
      memberCount: memberCountByConv.get(conv.id),
      canPost: canPostInConversation({
        membershipRole: membership[0].role,
        leaderOnly: conv.leaderOnly,
      }),
    })),
    members,
  };
}

export async function setConversationMuted(params: {
  conversationId: string;
  userId: string;
  muted: boolean;
}): Promise<boolean> {
  const updated = await db
    .update(conversationMembers)
    .set({ muted: params.muted })
    .where(
      and(
        eq(conversationMembers.conversationId, params.conversationId),
        eq(conversationMembers.userId, params.userId),
      ),
    )
    .returning({ id: conversationMembers.id });

  return Boolean(updated[0]);
}

export async function archiveConversation(params: {
  conversationId: string;
  userId: string;
  groupId: string;
}): Promise<boolean> {
  if (!(await assertLeaderOfGroup(params.groupId, params.userId))) return false;

  const conv = await db
    .select({ slug: conversations.slug })
    .from(conversations)
    .where(
      and(eq(conversations.id, params.conversationId), eq(conversations.groupId, params.groupId)),
    )
    .limit(1);

  if (!conv[0]) return false;
  if (conv[0].slug === "general") return false;

  await db
    .update(conversations)
    .set({ archivedAt: new Date() })
    .where(
      and(eq(conversations.id, params.conversationId), eq(conversations.groupId, params.groupId)),
    );

  return true;
}
