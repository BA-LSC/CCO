import { and, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  groupMemberships,
  serviceTeamMemberships,
  userPcoCredentials,
  users,
} from "../db/schema";
import {
  buildAllSignedUpMemberRecords,
  buildSignedUpMemberRecords,
  buildSignedUpMemberRecordsForGroup,
  buildSignedUpMemberRecordsForTeam,
  findSignedUpMember,
  mergeSignedUpMemberRecords,
  type SignedUpMemberRecord,
} from "./cco-member-status";
import { formatSidebarMessagePreview } from "@cco/shared/message-preview";
import { fetchLastMessagesForConversations } from "./unread";

export function buildDmPairKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}

export type DmParticipant = { id: string; displayName: string; avatarUrl?: string | null };

export type DmSummary = {
  id: string;
  participant: DmParticipant;
  hasUnread: boolean;
  lastActivityAt: string | null;
  lastMessagePreview: string | null;
  muted: boolean;
};

async function listSignedUpUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await db
    .select({ userId: userPcoCredentials.userId })
    .from(userPcoCredentials)
    .where(inArray(userPcoCredentials.userId, userIds));

  return new Set(rows.map((row) => row.userId));
}

async function isUserSignedUpOnCco(userId: string): Promise<boolean> {
  const signedUp = await listSignedUpUserIds([userId]);
  return signedUp.has(userId);
}

export async function directMessageParticipantsAreSignedUp(
  conversationId: string,
): Promise<boolean> {
  const conv = await db
    .select({ dmPairKey: conversations.dmPairKey })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv[0]?.dmPairKey) return true;

  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));

  if (members.length === 0) return false;

  const signedUp = await listSignedUpUserIds(members.map((member) => member.userId));
  return members.every((member) => signedUp.has(member.userId));
}

type CoMemberRow = {
  id: string;
  pcoPersonId: string;
  email: string;
  displayName: string;
};

/** Map shared group/team roster rows to signed-up CCO accounts eligible for DMs. */
export function resolveDmEligibleUserIds(
  selfUserId: string,
  coMembers: CoMemberRow[],
  signedUpRecords: SignedUpMemberRecord[],
): Set<string> {
  const signedUpIds = new Set(signedUpRecords.map((record) => record.userId));
  const eligible = new Set<string>();
  const seenMemberIds = new Set<string>();

  for (const member of coMembers) {
    if (member.id === selfUserId || seenMemberIds.has(member.id)) continue;
    seenMemberIds.add(member.id);

    if (signedUpIds.has(member.id)) {
      eligible.add(member.id);
      continue;
    }

    const matched = findSignedUpMember(
      {
        pcoPersonId: member.pcoPersonId,
        email: member.email,
        displayName: member.displayName,
      },
      signedUpRecords,
    );
    if (matched) eligible.add(matched.userId);
  }

  return eligible;
}

async function listCoMembersFromSharedGroups(userId: string, groupIds: string[]): Promise<CoMemberRow[]> {
  if (groupIds.length === 0) return [];

  return db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(and(inArray(groupMemberships.groupId, groupIds), ne(groupMemberships.userId, userId)));
}

async function listCoMembersFromSharedTeams(userId: string, teamIds: string[]): Promise<CoMemberRow[]> {
  if (teamIds.length === 0) return [];

  return db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(serviceTeamMemberships)
    .innerJoin(users, eq(users.id, serviceTeamMemberships.userId))
    .where(and(inArray(serviceTeamMemberships.teamId, teamIds), ne(serviceTeamMemberships.userId, userId)));
}

async function listSignedUpRecordsForSharedContext(
  organizationId: string,
  groupIds: string[],
  teamIds: string[],
): Promise<SignedUpMemberRecord[]> {
  const [orgRecords, allRecords, groupRecords, teamRecords] = await Promise.all([
    organizationId ? buildSignedUpMemberRecords(organizationId) : Promise.resolve([]),
    buildAllSignedUpMemberRecords(),
    Promise.all(groupIds.map((groupId) => buildSignedUpMemberRecordsForGroup(groupId))),
    Promise.all(teamIds.map((teamId) => buildSignedUpMemberRecordsForTeam(teamId))),
  ]);

  return mergeSignedUpMemberRecords(
    orgRecords,
    allRecords,
    ...groupRecords,
    ...teamRecords,
  );
}

async function listSignedUpCoMemberIdsInGroups(
  userId: string,
  groupIds: string[],
): Promise<string[]> {
  if (groupIds.length === 0) return [];

  const rows = await db
    .select({ id: users.id })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(and(inArray(groupMemberships.groupId, groupIds), ne(groupMemberships.userId, userId)))
    .groupBy(users.id);

  return rows.map((row) => row.id);
}

async function listSignedUpCoMemberIdsInTeams(userId: string, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];

  const rows = await db
    .select({ id: users.id })
    .from(serviceTeamMemberships)
    .innerJoin(users, eq(users.id, serviceTeamMemberships.userId))
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(
      and(inArray(serviceTeamMemberships.teamId, teamIds), ne(serviceTeamMemberships.userId, userId)),
    )
    .groupBy(users.id);

  return rows.map((row) => row.id);
}

export async function listDmEligibleUserIds(userId: string, organizationId: string): Promise<Set<string>> {
  const [myGroups, myTeams] = await Promise.all([
    db
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(eq(groupMemberships.userId, userId)),
    db
      .select({ teamId: serviceTeamMemberships.teamId })
      .from(serviceTeamMemberships)
      .where(eq(serviceTeamMemberships.userId, userId)),
  ]);

  const groupIds = myGroups.map((row) => row.groupId);
  const teamIds = myTeams.map((row) => row.teamId);
  if (groupIds.length === 0 && teamIds.length === 0) return new Set();

  const [groupMembers, teamMembers, signedUpRecords, directGroupIds, directTeamIds] =
    await Promise.all([
      listCoMembersFromSharedGroups(userId, groupIds),
      listCoMembersFromSharedTeams(userId, teamIds),
      listSignedUpRecordsForSharedContext(organizationId, groupIds, teamIds),
      listSignedUpCoMemberIdsInGroups(userId, groupIds),
      listSignedUpCoMemberIdsInTeams(userId, teamIds),
    ]);

  const eligible = resolveDmEligibleUserIds(
    userId,
    [...groupMembers, ...teamMembers],
    signedUpRecords,
  );

  for (const id of directGroupIds) eligible.add(id);
  for (const id of directTeamIds) eligible.add(id);

  return eligible;
}

/** @deprecated Use listDmEligibleUserIds */
export async function listSharedGroupUserIds(userId: string, organizationId: string): Promise<Set<string>> {
  return listDmEligibleUserIds(userId, organizationId);
}

export async function searchDmCandidates(params: {
  userId: string;
  organizationId: string;
  query?: string;
  limit?: number;
}): Promise<DmParticipant[]> {
  const [allowedIds, existingDmUserIds] = await Promise.all([
    listDmEligibleUserIds(params.userId, params.organizationId),
    listExistingDmParticipantUserIds(params.userId),
  ]);
  if (allowedIds.size === 0) return [];

  const idList = [...allowedIds].filter(
    (id) => id !== params.userId && !existingDmUserIds.has(id),
  );
  if (idList.length === 0) return [];

  const limit = Math.min(params.limit ?? 20, 50);
  const q = params.query?.trim();

  const conditions = [inArray(users.id, idList)];

  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, "")}%`;
    conditions.push(or(ilike(users.displayName, pattern), ilike(users.email, pattern))!);
  }

  const rows = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(and(...conditions))
    .orderBy(users.displayName)
    .limit(limit);

  return rows;
}

async function listExistingDmParticipantUserIds(userId: string): Promise<Set<string>> {
  const memberships = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        isNull(conversations.groupId),
        isNull(conversations.serviceTeamId),
        sql`${conversations.dmPairKey} IS NOT NULL`,
        isNull(conversations.archivedAt),
      ),
    );

  if (memberships.length === 0) return new Set();

  const conversationIds = memberships.map((row) => row.conversationId);
  const others = await db
    .select({ id: users.id })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(
      and(
        inArray(conversationMembers.conversationId, conversationIds),
        ne(conversationMembers.userId, userId),
      ),
    );

  return new Set(others.map((row) => row.id));
}

async function assertCanMessageUser(params: {
  userId: string;
  targetUserId: string;
  organizationId: string;
}): Promise<DmParticipant | null> {
  if (params.userId === params.targetUserId) return null;

  const allowed = await listDmEligibleUserIds(params.userId, params.organizationId);
  if (!allowed.has(params.targetUserId)) return null;

  const row = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(users.id, params.targetUserId))
    .limit(1);

  return row[0] ?? null;
}

export async function getOrCreateDirectMessage(params: {
  userId: string;
  targetUserId: string;
  organizationId: string;
}): Promise<{ id: string; participant: DmParticipant } | null> {
  const participant = await assertCanMessageUser(params);
  if (!participant) return null;

  const pairKey = buildDmPairKey(params.userId, params.targetUserId);

  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.dmPairKey, pairKey), isNull(conversations.archivedAt)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, participant };
  }

  const [created] = await db
    .insert(conversations)
    .values({
      dmPairKey: pairKey,
      slug: "dm",
      title: participant.displayName,
      leaderOnly: false,
    })
    .onConflictDoNothing()
    .returning({ id: conversations.id });

  const conversationId =
    created?.id ??
    (
      await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.dmPairKey, pairKey))
        .limit(1)
    )[0]?.id;

  if (!conversationId) return null;

  await db
    .insert(conversationMembers)
    .values([
      { conversationId, userId: params.userId },
      { conversationId, userId: params.targetUserId },
    ])
    .onConflictDoNothing();

  return { id: conversationId, participant };
}

export async function listDirectMessages(userId: string): Promise<DmSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      muted: conversationMembers.muted,
      lastReadAt: conversationMembers.lastReadAt,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        isNull(conversations.groupId),
        isNull(conversations.serviceTeamId),
        sql`${conversations.dmPairKey} IS NOT NULL`,
        isNull(conversations.archivedAt),
      ),
    );

  if (rows.length === 0) return [];

  const convIds = rows.map((r) => r.id);
  const memberByConv = new Map(
    rows.map((r) => [r.id, { muted: r.muted, lastReadAt: r.lastReadAt }]),
  );

  const otherMembers = await db
    .select({
      conversationId: conversationMembers.conversationId,
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(inArray(conversationMembers.conversationId, convIds), ne(conversationMembers.userId, userId)));

  const participantByConv = new Map(
    otherMembers.map((m) => [
      m.conversationId,
      { id: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl ?? null },
    ]),
  );

  const signedUpParticipantIds = await listSignedUpUserIds(otherMembers.map((member) => member.id));

  const lastByConvRaw = await fetchLastMessagesForConversations(convIds);
  const lastByConv = new Map<string, { authorId: string; createdAt: string }>();
  const previewByConv = new Map<string, string | null>();
  for (const [conversationId, last] of lastByConvRaw) {
    lastByConv.set(conversationId, {
      authorId: last.authorId,
      createdAt: last.createdAt.toISOString(),
    });
    const participant = participantByConv.get(conversationId);
    previewByConv.set(
      conversationId,
      formatSidebarMessagePreview({
        body: last.body,
        attachmentUrl: last.attachmentUrl,
        messageType: last.messageType,
        authorIsSelf: last.authorId === userId,
        authorDisplayName:
          last.authorId === userId ? undefined : participant?.displayName,
      }),
    );
  }

  const summaries: DmSummary[] = convIds
    .map((id) => {
      const participant = participantByConv.get(id);
      if (!participant || !signedUpParticipantIds.has(participant.id)) return null;
      const member = memberByConv.get(id);
      const last = lastByConv.get(id);
      const lastReadAt = member?.lastReadAt?.toISOString() ?? null;
      const hasUnread =
        last !== undefined &&
        last.authorId !== userId &&
        (lastReadAt === null || last.createdAt > lastReadAt);

      return {
        id,
        participant,
        hasUnread,
        lastActivityAt: last?.createdAt ?? null,
        lastMessagePreview: previewByConv.get(id) ?? null,
        muted: member?.muted ?? false,
      };
    })
    .filter((s): s is DmSummary => s !== null);

  summaries.sort((a, b) => {
    const aTime = a.lastActivityAt ?? "";
    const bTime = b.lastActivityAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return summaries;
}

export async function getDirectMessage(params: {
  conversationId: string;
  userId: string;
}): Promise<{ id: string; participant: DmParticipant; muted: boolean } | null> {
  const row = await db
    .select({
      id: conversations.id,
      muted: conversationMembers.muted,
      dmPairKey: conversations.dmPairKey,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversations.id, params.conversationId),
        eq(conversationMembers.userId, params.userId),
        isNull(conversations.groupId),
        isNull(conversations.serviceTeamId),
        sql`${conversations.dmPairKey} IS NOT NULL`,
        isNull(conversations.archivedAt),
      ),
    )
    .limit(1);

  if (!row[0]?.dmPairKey) return null;

  const other = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(
      and(
        eq(conversationMembers.conversationId, params.conversationId),
        ne(conversationMembers.userId, params.userId),
      ),
    )
    .limit(1);

  if (!other[0]) return null;

  if (!(await isUserSignedUpOnCco(other[0].id))) return null;

  return {
    id: row[0].id,
    participant: other[0],
    muted: row[0].muted,
  };
}
