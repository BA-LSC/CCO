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
import { publishMessageEvent } from "../realtime/pubsub";
import { formatSidebarMessagePreview } from "@cco/shared/message-preview";
import { fetchLastMessagesForConversations } from "./unread";
import { isPlaceholderDisplayName } from "./cco-member-status";
import { resolveDisplayNamesForUsers } from "./user-profile";

export function buildDmPairKey(userIdA: string, userIdB: string): string {
  return buildDmMemberKey([userIdA, userIdB]);
}

export function buildDmMemberKey(userIds: string[]): string {
  return [...new Set(userIds.map((id) => id.trim()).filter(Boolean))].sort().join(":");
}

export function isDirectDmPairKey(dmPairKey: string): boolean {
  return dmPairKey.split(":").length === 2;
}

export function isDmGroupPairKey(dmPairKey: string): boolean {
  return dmPairKey.split(":").length >= 3;
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName.trim();
}

export function formatDefaultDmGroupTitle(displayNames: string[]): string {
  const names = displayNames.map((name) => firstName(name)).filter(Boolean);
  if (names.length === 0) return "Group message";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export type DmKind = "direct" | "group";

export type DmParticipant = { id: string; displayName: string; avatarUrl?: string | null };

export type DmSummary = {
  id: string;
  kind: DmKind;
  title: string;
  imageUrl?: string | null;
  participant?: DmParticipant;
  participantCount?: number;
  hasUnread: boolean;
  lastActivityAt: string | null;
  lastMessagePreview: string | null;
  muted: boolean;
};

export type DmDetail = {
  id: string;
  kind: DmKind;
  title: string;
  imageUrl?: string | null;
  muted: boolean;
  participant?: DmParticipant;
  participants: DmParticipant[];
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
  const allowedIds = await listDmEligibleUserIds(params.userId, params.organizationId);
  if (allowedIds.size === 0) return [];

  const idList = [...allowedIds].filter((id) => id !== params.userId);
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

export async function getOrCreateDmGroup(params: {
  userId: string;
  memberUserIds: string[];
  organizationId: string;
}): Promise<{ id: string } | null> {
  const uniqueTargets = [
    ...new Set(params.memberUserIds.map((id) => id.trim()).filter((id) => id && id !== params.userId)),
  ];
  if (uniqueTargets.length < 2) return null;

  for (const targetUserId of uniqueTargets) {
    const participant = await assertCanMessageUser({
      userId: params.userId,
      targetUserId,
      organizationId: params.organizationId,
    });
    if (!participant) return null;
  }

  const memberKey = buildDmMemberKey([params.userId, ...uniqueTargets]);

  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.dmPairKey, memberKey), isNull(conversations.archivedAt)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id };
  }

  const otherParticipants = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, uniqueTargets));

  const defaultTitle = formatDefaultDmGroupTitle(otherParticipants.map((row) => row.displayName));

  const [created] = await db
    .insert(conversations)
    .values({
      dmPairKey: memberKey,
      slug: "dm-group",
      title: defaultTitle,
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
        .where(eq(conversations.dmPairKey, memberKey))
        .limit(1)
    )[0]?.id;

  if (!conversationId) return null;

  await db
    .insert(conversationMembers)
    .values([params.userId, ...uniqueTargets].map((userId) => ({ conversationId, userId })))
    .onConflictDoNothing();

  return { id: conversationId };
}

export async function updateDmConversation(params: {
  conversationId: string;
  userId: string;
  title?: string;
  imageUrl?: string | null;
}): Promise<{ id: string; title: string; imageUrl: string | null } | null> {
  const row = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      imageUrl: conversations.imageUrl,
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

  if (!row[0]?.dmPairKey || !isDmGroupPairKey(row[0].dmPairKey)) return null;

  const nextTitle =
    params.title !== undefined ? params.title.trim() : row[0].title.trim();
  if (!nextTitle) return null;

  const nextImageUrl =
    params.imageUrl !== undefined ? params.imageUrl?.trim() || null : row[0].imageUrl ?? null;

  const [updated] = await db
    .update(conversations)
    .set({
      title: nextTitle,
      imageUrl: nextImageUrl,
    })
    .where(eq(conversations.id, params.conversationId))
    .returning({ id: conversations.id, title: conversations.title, imageUrl: conversations.imageUrl });

  if (!updated) return null;

  await publishMessageEvent({
    type: "conversation.updated",
    conversationId: params.conversationId,
    title: updated.title,
    imageUrl: updated.imageUrl ?? null,
  });

  return {
    id: updated.id,
    title: updated.title,
    imageUrl: updated.imageUrl ?? null,
  };
}

async function loadDmMembersForUser(
  conversationIds: string[],
  userId: string,
  organizationId?: string,
): Promise<
  Map<
    string,
    {
      others: DmParticipant[];
      all: DmParticipant[];
    }
  >
> {
  if (conversationIds.length === 0) return new Map();

  const rows = await db
    .select({
      conversationId: conversationMembers.conversationId,
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(inArray(conversationMembers.conversationId, conversationIds));

  const byConversation = new Map<string, DmParticipant[]>();
  for (const row of rows) {
    const list = byConversation.get(row.conversationId) ?? [];
    list.push({
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
    });
    byConversation.set(row.conversationId, list);
  }

  const placeholderIds = rows
    .filter((row) => isPlaceholderDisplayName(row.displayName))
    .map((row) => row.id);
  const resolvedNames = await resolveDisplayNamesForUsers(placeholderIds, organizationId);

  const result = new Map<string, { others: DmParticipant[]; all: DmParticipant[] }>();
  for (const conversationId of conversationIds) {
    const members = (byConversation.get(conversationId) ?? []).map((member) => {
      const resolved = resolvedNames.get(member.id);
      return resolved ? { ...member, displayName: resolved } : member;
    });
    result.set(conversationId, {
      all: members,
      others: members.filter((member) => member.id !== userId),
    });
  }

  return result;
}

export async function listDirectMessages(
  userId: string,
  organizationId?: string,
): Promise<DmSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      imageUrl: conversations.imageUrl,
      dmPairKey: conversations.dmPairKey,
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

  const convIds = rows.map((row) => row.id);
  const convById = new Map(rows.map((row) => [row.id, row]));
  const memberByConv = new Map(
    rows.map((row) => [row.id, { muted: row.muted, lastReadAt: row.lastReadAt }]),
  );
  const membersByConv = await loadDmMembersForUser(convIds, userId, organizationId);
  const signedUpIds = await listSignedUpUserIds(
    [...membersByConv.values()].flatMap((entry) => entry.all.map((member) => member.id)),
  );

  const lastByConvRaw = await fetchLastMessagesForConversations(convIds);
  const lastByConv = new Map<string, { authorId: string; createdAt: string }>();
  const previewByConv = new Map<string, string | null>();
  const authorNameById = new Map<string, string>();
  for (const entry of membersByConv.values()) {
    for (const member of entry.all) {
      authorNameById.set(member.id, member.displayName);
    }
  }

  for (const [conversationId, last] of lastByConvRaw) {
    lastByConv.set(conversationId, {
      authorId: last.authorId,
      createdAt: last.createdAt.toISOString(),
    });
    previewByConv.set(
      conversationId,
      formatSidebarMessagePreview({
        body: last.body,
        attachmentUrl: last.attachmentUrl,
        messageType: last.messageType,
        authorIsSelf: last.authorId === userId,
        authorDisplayName:
          last.authorId === userId ? undefined : authorNameById.get(last.authorId),
      }),
    );
  }

  const summaries: DmSummary[] = convIds
    .map((id) => {
      const conv = convById.get(id);
      const members = membersByConv.get(id);
      if (!conv?.dmPairKey || !members) return null;
      if (!members.all.every((member) => signedUpIds.has(member.id))) return null;

      const isGroup = isDmGroupPairKey(conv.dmPairKey);
      const member = memberByConv.get(id);
      const last = lastByConv.get(id);
      const lastReadAt = member?.lastReadAt?.toISOString() ?? null;
      const hasUnread =
        last !== undefined &&
        last.authorId !== userId &&
        (lastReadAt === null || last.createdAt > lastReadAt);

      if (isGroup) {
        return {
          id,
          kind: "group" as const,
          title: conv.title,
          imageUrl: conv.imageUrl ?? null,
          participantCount: members.all.length,
          hasUnread,
          lastActivityAt: last?.createdAt ?? null,
          lastMessagePreview: previewByConv.get(id) ?? null,
          muted: member?.muted ?? false,
        };
      }

      const participant = members.others[0];
      if (!participant) return null;

      return {
        id,
        kind: "direct" as const,
        title: participant.displayName,
        participant,
        hasUnread,
        lastActivityAt: last?.createdAt ?? null,
        lastMessagePreview: previewByConv.get(id) ?? null,
        muted: member?.muted ?? false,
      };
    })
    .filter((summary): summary is DmSummary => summary !== null);

  summaries.sort((a, b) => {
    const aTime = a.lastActivityAt ?? "";
    const bTime = b.lastActivityAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return summaries;
}

export async function getDmConversation(params: {
  conversationId: string;
  userId: string;
  organizationId?: string;
}): Promise<DmDetail | null> {
  const row = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      imageUrl: conversations.imageUrl,
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

  const membersByConv = await loadDmMembersForUser([params.conversationId], params.userId, params.organizationId);
  const members = membersByConv.get(params.conversationId);
  if (!members || members.all.length === 0) return null;

  const signedUpIds = await listSignedUpUserIds(members.all.map((member) => member.id));
  if (!members.all.every((member) => signedUpIds.has(member.id))) return null;

  const isGroup = isDmGroupPairKey(row[0].dmPairKey);
  const participant = members.others[0];

  if (!isGroup) {
    if (!participant) return null;
    return {
      id: row[0].id,
      kind: "direct",
      title: participant.displayName,
      imageUrl: null,
      muted: row[0].muted,
      participant,
      participants: members.all,
    };
  }

  return {
    id: row[0].id,
    kind: "group",
    title: row[0].title,
    imageUrl: row[0].imageUrl ?? null,
    muted: row[0].muted,
    participants: members.all,
  };
}

/** @deprecated Use getDmConversation */
export async function getDirectMessage(params: {
  conversationId: string;
  userId: string;
  organizationId?: string;
}): Promise<DmDetail | null> {
  return getDmConversation(params);
}
