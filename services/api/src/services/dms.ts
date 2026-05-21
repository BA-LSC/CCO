import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  groupMemberships,
  messages,
  userPcoCredentials,
  users,
} from "../db/schema";

export function buildDmPairKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}

export type DmParticipant = { id: string; displayName: string; avatarUrl?: string | null };

export type DmSummary = {
  id: string;
  participant: DmParticipant;
  hasUnread: boolean;
  lastActivityAt: string | null;
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

export async function listSharedGroupUserIds(userId: string, organizationId: string): Promise<Set<string>> {
  const myGroups = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(eq(groupMemberships.userId, userId));

  const groupIds = myGroups.map((g) => g.groupId);
  if (groupIds.length === 0) return new Set();

  const rows = await db
    .selectDistinct({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(
      and(
        inArray(groupMemberships.groupId, groupIds),
        eq(users.organizationId, organizationId),
        ne(groupMemberships.userId, userId),
      ),
    );

  return new Set(rows.map((r) => r.userId));
}

export async function searchDmCandidates(params: {
  userId: string;
  organizationId: string;
  query?: string;
  limit?: number;
}): Promise<DmParticipant[]> {
  const allowedIds = await listSharedGroupUserIds(params.userId, params.organizationId);
  if (allowedIds.size === 0) return [];

  const idList = [...allowedIds];
  const limit = Math.min(params.limit ?? 20, 50);
  const q = params.query?.trim();

  const conditions = [inArray(users.id, idList), eq(users.organizationId, params.organizationId)];

  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, "")}%`;
    conditions.push(or(ilike(users.displayName, pattern), ilike(users.email, pattern))!);
  }

  const rows = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
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

  const allowed = await listSharedGroupUserIds(params.userId, params.organizationId);
  if (!allowed.has(params.targetUserId)) return null;

  const row = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(and(eq(users.id, params.targetUserId), eq(users.organizationId, params.organizationId)))
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

  const lastMessages = await db
    .select({
      conversationId: messages.conversationId,
      authorId: messages.authorId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(inArray(messages.conversationId, convIds), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt));

  const lastByConv = new Map<string, { authorId: string; createdAt: string }>();
  for (const msg of lastMessages) {
    if (!lastByConv.has(msg.conversationId)) {
      lastByConv.set(msg.conversationId, {
        authorId: msg.authorId,
        createdAt: msg.createdAt.toISOString(),
      });
    }
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
