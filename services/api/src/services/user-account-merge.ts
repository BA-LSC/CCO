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

export function usersLikelySamePerson(
  authUser: { pcoPersonId: string; email: string; displayName: string },
  candidate: { pcoPersonId: string; email: string; displayName: string },
): boolean {
  if (candidate.pcoPersonId === authUser.pcoPersonId) return true;

  const authEmail = normalizeMemberEmail(authUser.email);
  const candidateEmail = normalizeMemberEmail(candidate.email);
  if (authEmail && candidateEmail && authEmail === candidateEmail) return true;

  if (
    isLikelyPlaceholderUser(candidate) &&
    namesLikelyMatch(authUser.displayName, candidate.displayName)
  ) {
    return true;
  }

  if (namesLikelyMatch(authUser.displayName, candidate.displayName)) return true;

  return false;
}

/** Merge placeholder group members into authenticated accounts (any org). */
export async function reconcileGroupPlaceholderUsers(groupId: string): Promise<void> {
  const groupMembers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
      hasCredentials: userPcoCredentials.userId,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .leftJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(groupMemberships.groupId, groupId));

  const placeholders = groupMembers.filter((member) => !member.hasCredentials);
  if (placeholders.length === 0) return;

  const authUsers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id));

  for (const candidate of placeholders) {
    const authUser = authUsers.find((user) => usersLikelySamePerson(user, candidate));
    if (!authUser || authUser.id === candidate.id) continue;

    try {
      await mergePlaceholderUserIntoAuthenticated(candidate.id, authUser.id);
    } catch (err) {
      console.warn(
        `Group placeholder merge failed (${candidate.id} -> ${authUser.id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/** Merge placeholder service team members into authenticated accounts (any org). */
export async function reconcileTeamPlaceholderUsers(teamId: string): Promise<void> {
  const teamMembers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
      hasCredentials: userPcoCredentials.userId,
    })
    .from(serviceTeamMemberships)
    .innerJoin(users, eq(users.id, serviceTeamMemberships.userId))
    .leftJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(serviceTeamMemberships.teamId, teamId));

  const placeholders = teamMembers.filter((member) => !member.hasCredentials);
  if (placeholders.length === 0) return;

  const authUsers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id));

  for (const candidate of placeholders) {
    const authUser = authUsers.find((user) => usersLikelySamePerson(user, candidate));
    if (!authUser || authUser.id === candidate.id) continue;

    try {
      await mergePlaceholderUserIntoAuthenticated(candidate.id, authUser.id);
    } catch (err) {
      console.warn(
        `Team placeholder merge failed (${candidate.id} -> ${authUser.id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/** Merge all roster/webhook placeholder users into authenticated accounts for an org. */
export async function reconcileOrgPlaceholderUsers(organizationId: string): Promise<void> {
  const authUsers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(users.organizationId, organizationId));

  if (authUsers.length === 0) return;

  const placeholders = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .leftJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(and(eq(users.organizationId, organizationId), isNull(userPcoCredentials.userId)));

  for (const candidate of placeholders) {
    const authUser = authUsers.find((user) => usersLikelySamePerson(user, candidate));
    if (!authUser || authUser.id === candidate.id) continue;

    try {
      await mergePlaceholderUserIntoAuthenticated(candidate.id, authUser.id);
    } catch (err) {
      console.warn(
        `Placeholder user merge failed (${candidate.id} -> ${authUser.id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
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
    if (!usersLikelySamePerson(authUser, candidate)) continue;

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
