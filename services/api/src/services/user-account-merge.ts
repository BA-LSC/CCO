import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import {
  conversationMembers,
  groupMemberships,
  messageReactions,
  messages,
  serviceTeamMemberships,
  userPcoCredentials,
  users,
} from "../db/schema";
import {
  namesLikelyMatch,
  normalizeMemberDisplayName,
  normalizeMemberEmail,
} from "./cco-member-status";

function isLikelyPlaceholderUser(user: { email: string; displayName: string }): boolean {
  return (
    !normalizeMemberEmail(user.email) ||
    normalizeMemberDisplayName(user.displayName) === "member"
  );
}

async function transferGroupMemberships(fromUserId: string, toUserId: string): Promise<void> {
  const rows = await db
    .select()
    .from(groupMemberships)
    .where(eq(groupMemberships.userId, fromUserId));

  for (const row of rows) {
    await db
      .insert(groupMemberships)
      .values({
        groupId: row.groupId,
        userId: toUserId,
        role: row.role,
        syncedAt: row.syncedAt,
      })
      .onConflictDoUpdate({
        target: [groupMemberships.groupId, groupMemberships.userId],
        set: { syncedAt: row.syncedAt },
      });
  }

  await db.delete(groupMemberships).where(eq(groupMemberships.userId, fromUserId));
}

async function transferConversationMemberships(fromUserId: string, toUserId: string): Promise<void> {
  const rows = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, fromUserId));

  for (const row of rows) {
    await db
      .insert(conversationMembers)
      .values({
        conversationId: row.conversationId,
        userId: toUserId,
        muted: row.muted,
        lastReadAt: row.lastReadAt,
      })
      .onConflictDoUpdate({
        target: [conversationMembers.conversationId, conversationMembers.userId],
        set: {
          muted: row.muted,
          lastReadAt: row.lastReadAt,
        },
      });
  }

  await db.delete(conversationMembers).where(eq(conversationMembers.userId, fromUserId));
}

async function transferServiceTeamMemberships(fromUserId: string, toUserId: string): Promise<void> {
  const rows = await db
    .select()
    .from(serviceTeamMemberships)
    .where(eq(serviceTeamMemberships.userId, fromUserId));

  for (const row of rows) {
    await db
      .insert(serviceTeamMemberships)
      .values({
        teamId: row.teamId,
        userId: toUserId,
        role: row.role,
        syncedAt: row.syncedAt,
      })
      .onConflictDoUpdate({
        target: [serviceTeamMemberships.teamId, serviceTeamMemberships.userId],
        set: { syncedAt: row.syncedAt },
      });
  }

  await db.delete(serviceTeamMemberships).where(eq(serviceTeamMemberships.userId, fromUserId));
}

async function mergePlaceholderUserIntoAuthenticated(
  placeholderUserId: string,
  authenticatedUserId: string,
): Promise<void> {
  await transferGroupMemberships(placeholderUserId, authenticatedUserId);
  await transferConversationMemberships(placeholderUserId, authenticatedUserId);
  await transferServiceTeamMemberships(placeholderUserId, authenticatedUserId);

  await db
    .update(messages)
    .set({ authorId: authenticatedUserId })
    .where(eq(messages.authorId, placeholderUserId));

  await db
    .update(messageReactions)
    .set({ userId: authenticatedUserId })
    .where(eq(messageReactions.userId, placeholderUserId));

  await db.delete(users).where(eq(users.id, placeholderUserId));
}

/** Merge roster/webhook placeholder users into the authenticated account after PCO login. */
export async function reconcilePlaceholderUsersOnLogin(params: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  const authRows = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(and(eq(users.id, params.userId), eq(users.organizationId, params.organizationId)))
    .limit(1);

  const authUser = authRows[0];
  if (!authUser) return;

  const placeholders = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .leftJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(
      and(
        eq(users.organizationId, params.organizationId),
        ne(users.id, params.userId),
        isNull(userPcoCredentials.userId),
      ),
    );

  for (const candidate of placeholders) {
    const samePerson =
      candidate.pcoPersonId === authUser.pcoPersonId ||
      (isLikelyPlaceholderUser(candidate) &&
        namesLikelyMatch(authUser.displayName, candidate.displayName));

    if (!samePerson) continue;

    try {
      await mergePlaceholderUserIntoAuthenticated(candidate.id, params.userId);
    } catch (err) {
      console.warn(
        `Placeholder user merge failed (${candidate.id} -> ${params.userId}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
