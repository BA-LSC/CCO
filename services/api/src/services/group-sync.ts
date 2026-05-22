import { and, eq, inArray } from "drizzle-orm";
import type { GroupMembership, GroupRosterMember, SimpleGroup } from "@cco/pco-client";
import { fetchPersonAvatarUrl, PlanningCenterClient, fetchGroupRoster, fetchMyRoleInGroup } from "@cco/pco-client";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  groupMemberships,
  groups,
  users,
} from "../db/schema";
import { isLeaderRole } from "../permissions";
import { mergeGroups } from "../sync/groups";
import { upsertUserFromPco } from "./bootstrap";
import {
  buildLocalMemberLookups,
  buildSignedUpMemberIndexFromRecords,
  buildSignedUpMemberRecords,
  buildSignedUpMemberRecordsForGroup,
  findLocalMember,
  memberIsOnCco,
  mergeSignedUpMemberRecords,
  resolveRosterMemberLink,
} from "./cco-member-status";
import {
  ensureConversationMembers,
  ensureGeneralConversation,
  ensureGeneralConversationMembers,
} from "./conversations";
import {
  reconcileGroupPlaceholderUsers,
  reconcileOrgPlaceholderUsers,
} from "./user-account-merge";

export async function persistGroupSync(params: {
  organizationId: string;
  userId: string;
  incoming: SimpleGroup[];
  memberships?: GroupMembership[];
}): Promise<{ created: number; updated: number }> {
  const roleByPcoGroupId = new Map(
    (params.memberships ?? []).map((m) => [m.pcoGroupId, m.role]),
  );

  const existing = await db
    .select({
      pcoGroupId: groups.pcoGroupId,
      name: groups.name,
      imageUrl: groups.imageUrl,
      id: groups.id,
    })
    .from(groups)
    .where(eq(groups.organizationId, params.organizationId));

  const { toCreate, toUpdate } = mergeGroups(
    existing.map((g) => ({ pcoGroupId: g.pcoGroupId, name: g.name, imageUrl: g.imageUrl })),
    params.incoming,
  );

  const pcoToId = new Map(existing.map((g) => [g.pcoGroupId, g.id]));

  for (const group of toCreate) {
    const [row] = await db
      .insert(groups)
      .values({
        organizationId: params.organizationId,
        pcoGroupId: group.pcoGroupId,
        name: group.name,
        imageUrl: group.imageUrl ?? null,
      })
      .returning({ id: groups.id });
    pcoToId.set(group.pcoGroupId, row.id);

    await upsertGroupMembership({
      groupId: row.id,
      userId: params.userId,
      role: roleByPcoGroupId.get(group.pcoGroupId) ?? "member",
    });

    const conversationId = await ensureGeneralConversation(row.id);
    await ensureConversationMembers(conversationId, row.id);
  }

  for (const update of toUpdate) {
    const groupId = pcoToId.get(update.pcoGroupId);
    if (!groupId) continue;
    await db
      .update(groups)
      .set({ name: update.name, imageUrl: update.imageUrl ?? null })
      .where(eq(groups.id, groupId));
  }

  for (const group of params.incoming) {
    const groupId = pcoToId.get(group.pcoGroupId);
    if (!groupId) continue;

    await upsertGroupMembership({
      groupId,
      userId: params.userId,
      role: roleByPcoGroupId.get(group.pcoGroupId) ?? "member",
    });

    const conversationId = await ensureGeneralConversation(groupId);
    await ensureConversationMembers(conversationId, groupId);
  }

  return { created: toCreate.length, updated: toUpdate.length };
}

async function upsertGroupMembership(params: {
  groupId: string;
  userId: string;
  role: string;
}): Promise<void> {
  await db
    .insert(groupMemberships)
    .values({
      groupId: params.groupId,
      userId: params.userId,
      role: params.role,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [groupMemberships.groupId, groupMemberships.userId],
      set: { role: params.role, syncedAt: new Date() },
    });
}

export async function syncGroupRoster(params: {
  organizationId: string;
  groupId: string;
  pcoGroupId: string;
  accessToken: string;
}): Promise<{ upserted: number; removed: number }> {
  const { fetchGroupRoster } = await import("@cco/pco-client");
  const client = new PlanningCenterClient({ accessToken: params.accessToken });
  const roster: GroupRosterMember[] = await fetchGroupRoster(client, params.pcoGroupId);

  const rosterPcoPersonIds = new Set(roster.map((m) => m.pcoPersonId));
  const existingUsers =
    roster.length > 0
      ? await db
          .select({ pcoPersonId: users.pcoPersonId, avatarUrl: users.avatarUrl })
          .from(users)
          .where(inArray(users.pcoPersonId, [...rosterPcoPersonIds]))
      : [];
  const avatarByPcoPersonId = new Map(
    existingUsers.map((user) => [user.pcoPersonId, user.avatarUrl]),
  );

  let upserted = 0;

  for (const member of roster) {
    const displayName =
      [member.firstName, member.lastName].filter(Boolean).join(" ").trim() || "Member";

    let avatarUrl = member.avatarUrl ?? null;
    if (!avatarUrl && !avatarByPcoPersonId.get(member.pcoPersonId)) {
      try {
        avatarUrl = await fetchPersonAvatarUrl(client, member.pcoPersonId);
      } catch (err) {
        console.warn(
          `Avatar lookup failed for PCO person ${member.pcoPersonId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const userId = await upsertUserFromPco(params.organizationId, {
      personId: member.pcoPersonId,
      email: member.email ?? `${member.pcoPersonId}@placeholder.local`,
      displayName,
      ...(avatarUrl ? { avatarUrl } : {}),
    });

    await upsertGroupMembership({
      groupId: params.groupId,
      userId,
      role: member.role,
    });
    upserted += 1;
  }

  const localMembers = await db
    .select({ userId: groupMemberships.userId, pcoPersonId: users.pcoPersonId })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(eq(groupMemberships.groupId, params.groupId));

  let removed = 0;
  for (const local of localMembers) {
    if (rosterPcoPersonIds.has(local.pcoPersonId)) continue;
    await removeUserFromGroup(params.groupId, local.userId);
    removed += 1;
  }

  const conversationId = await ensureGeneralConversation(params.groupId);
  await ensureGeneralConversationMembers(params.groupId);

  return { upserted, removed };
}

export async function removeUserFromGroup(groupId: string, userId: string): Promise<void> {
  await db
    .delete(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)));

  const convs = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.groupId, groupId));

  for (const conv of convs) {
    await db
      .delete(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.userId, userId)),
      );
  }
}

/** Pull full PCO roster for groups where the user is a leader. */
export async function syncLeaderGroupRosters(params: {
  organizationId: string;
  userId: string;
  accessToken: string;
}): Promise<{ groupsSynced: number; upserted: number }> {
  const leaderGroups = await db
    .select({
      groupId: groupMemberships.groupId,
      pcoGroupId: groups.pcoGroupId,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.userId, params.userId),
        inArray(groupMemberships.role, ["leader", "admin"]),
      ),
    );

  let groupsSynced = 0;
  let upserted = 0;

  for (const group of leaderGroups) {
    try {
      const result = await syncGroupRoster({
        organizationId: params.organizationId,
        groupId: group.groupId,
        pcoGroupId: group.pcoGroupId,
        accessToken: params.accessToken,
      });
      groupsSynced += 1;
      upserted += result.upserted;
    } catch (err) {
      console.warn(`Roster sync failed for group ${group.groupId}:`, err);
    }
  }

  return { groupsSynced, upserted };
}

/** Refresh the signed-in user's PCO role for one group (best-effort). */
export async function refreshUserGroupRoleFromPco(params: {
  groupId: string;
  pcoGroupId: string;
  userId: string;
  pcoPersonId: string;
  accessToken: string;
}): Promise<string | null> {
  try {
    const client = new PlanningCenterClient({ accessToken: params.accessToken });
    const role = await fetchMyRoleInGroup(client, params.pcoGroupId, params.pcoPersonId);
    await upsertGroupMembership({
      groupId: params.groupId,
      userId: params.userId,
      role,
    });
    return role;
  } catch (err) {
    console.warn(`Role refresh failed for group ${params.groupId}:`, err);
    return null;
  }
}

/** Refresh roster when a leader opens a group (best-effort). */
export async function trySyncGroupRosterForLeader(params: {
  organizationId: string;
  groupId: string;
  userId: string;
  pcoPersonId: string;
  membershipRole: string;
  accessToken: string | undefined;
  pcoGroupId: string;
}): Promise<boolean> {
  if (!params.accessToken || !params.pcoPersonId) return false;

  const refreshedRole = await refreshUserGroupRoleFromPco({
    groupId: params.groupId,
    pcoGroupId: params.pcoGroupId,
    userId: params.userId,
    pcoPersonId: params.pcoPersonId,
    accessToken: params.accessToken,
  });

  const role = refreshedRole ?? params.membershipRole;
  if (!isLeaderRole(role)) return false;

  try {
    await syncGroupRoster({
      organizationId: params.organizationId,
      groupId: params.groupId,
      pcoGroupId: params.pcoGroupId,
      accessToken: params.accessToken,
    });
    return true;
  } catch (err) {
    console.warn(`Auto roster sync failed for group ${params.groupId}:`, err);
    return false;
  }
}

export async function removeGroupMembership(params: {
  pcoGroupId: string;
  pcoPersonId: string;
}): Promise<boolean> {
  const groupRow = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.pcoGroupId, params.pcoGroupId))
    .limit(1);

  if (!groupRow[0]) return false;

  const userRow = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.pcoPersonId, params.pcoPersonId))
    .limit(1);

  if (!userRow[0]) return false;

  await removeUserFromGroup(groupRow[0].id, userRow[0].id);

  return true;
}

export type GroupMemberView = {
  id?: string;
  pcoPersonId: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
  onCco: boolean;
  email?: string | null;
};

function sortGroupMembersByName(members: GroupMemberView[]): GroupMemberView[] {
  return [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
}

function rosterDisplayName(member: GroupRosterMember): string {
  return [member.firstName, member.lastName].filter(Boolean).join(" ").trim() || "Member";
}

export async function listGroupMembersForDetail(params: {
  groupId: string;
  organizationId: string;
  membershipRole: string;
  pcoGroupId: string;
  accessToken?: string;
}): Promise<GroupMemberView[]> {
  await reconcileGroupPlaceholderUsers(params.groupId);
  await reconcileOrgPlaceholderUsers(params.organizationId);

  const ccoMembers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      email: users.email,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(eq(groupMemberships.groupId, params.groupId));

  const [orgRecords, groupRecords] = await Promise.all([
    buildSignedUpMemberRecords(params.organizationId),
    buildSignedUpMemberRecordsForGroup(params.groupId),
  ]);
  const signedUpRecords = mergeSignedUpMemberRecords(orgRecords, groupRecords);
  const signedUp = buildSignedUpMemberIndexFromRecords(signedUpRecords);
  const isLeader = isLeaderRole(params.membershipRole);

  if (!isLeader || !params.accessToken) {
    return sortGroupMembersByName(
      ccoMembers.map((member) => ({
        id: member.id,
        pcoPersonId: member.pcoPersonId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        role: member.role,
        onCco: true,
        email: null,
      })),
    );
  }

  try {
    const client = new PlanningCenterClient({ accessToken: params.accessToken });
    const roster = await fetchGroupRoster(client, params.pcoGroupId);
    const localLookups = buildLocalMemberLookups(ccoMembers);

    return sortGroupMembersByName(
      roster.map((person) => {
        const rosterName = rosterDisplayName(person);
        const local = findLocalMember(
          { pcoPersonId: person.pcoPersonId, email: person.email, displayName: rosterName },
          localLookups,
        );
        const matchPerson = {
          pcoPersonId: person.pcoPersonId,
          email: person.email ?? local?.email,
          displayName: rosterName,
          firstName: person.firstName,
          lastName: person.lastName,
        };
        const link = resolveRosterMemberLink(
          matchPerson,
          local?.id,
          signedUp,
          signedUpRecords,
        );
        return {
          id: link.userId,
          pcoPersonId: person.pcoPersonId,
          displayName: rosterName,
          avatarUrl: local?.avatarUrl ?? person.avatarUrl,
          role: local?.role ?? person.role,
          onCco: link.onCco,
          email: person.email,
        };
      }),
    );
  } catch (err) {
    console.warn(
      "Group roster lookup failed:",
      err instanceof Error ? err.message : err,
    );
    return sortGroupMembersByName(
      ccoMembers.map((member) => ({
        id: member.id,
        pcoPersonId: member.pcoPersonId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        role: member.role,
        onCco: memberIsOnCco(
          {
            pcoPersonId: member.pcoPersonId,
            email: member.email,
            displayName: member.displayName,
          },
          member.id,
          signedUp,
          signedUpRecords,
        ),
        email: null,
      })),
    );
  }
}

export async function removeMemberFromGroupWithPco(params: {
  organizationId: string;
  groupId: string;
  pcoGroupId: string;
  targetUserId: string;
  accessToken: string;
}): Promise<{ pcoRemoved: boolean }> {
  const userRow = await db
    .select({ pcoPersonId: users.pcoPersonId })
    .from(users)
    .where(eq(users.id, params.targetUserId))
    .limit(1);

  if (!userRow[0]) {
    await removeUserFromGroup(params.groupId, params.targetUserId);
    return { pcoRemoved: false };
  }

  const { deleteGroupMembership, findGroupMembershipId, PlanningCenterClient } = await import(
    "@cco/pco-client"
  );
  const client = new PlanningCenterClient({ accessToken: params.accessToken });

  let pcoRemoved = false;
  try {
    const membershipId = await findGroupMembershipId(
      client,
      params.pcoGroupId,
      userRow[0].pcoPersonId,
    );
    if (membershipId) {
      await deleteGroupMembership(client, params.pcoGroupId, membershipId);
      pcoRemoved = true;
    }
  } catch (err) {
    console.warn("PCO group membership delete failed:", err);
    throw err;
  }

  await removeUserFromGroup(params.groupId, params.targetUserId);
  return { pcoRemoved };
}
