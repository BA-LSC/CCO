import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers } from "../db/schema";

export async function fetchLastMessagesForConversations(
  conversationIds: string[],
): Promise<Map<string, { authorId: string; createdAt: Date }>> {
  const result = new Map<string, { authorId: string; createdAt: Date }>();
  if (conversationIds.length === 0) return result;

  const rows = await db.execute<{
    conversation_id: string;
    author_id: string;
    created_at: Date | string;
  }>(sql`
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      author_id,
      created_at
    FROM messages
    WHERE conversation_id IN (${sql.join(
      conversationIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      AND deleted_at IS NULL
    ORDER BY conversation_id, created_at DESC
  `);

  for (const row of rows) {
    const createdAt =
      row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    result.set(row.conversation_id, {
      authorId: row.author_id,
      createdAt,
    });
  }

  return result;
}

export function isUnreadMessage(params: {
  authorId: string;
  createdAt: Date;
  userId: string;
  lastReadAt: Date | null;
}): boolean {
  if (params.authorId === params.userId) return false;
  if (params.lastReadAt === null) return true;
  return params.createdAt > params.lastReadAt;
}

export function hasUnreadFromLastMessage(params: {
  lastMessage?: { authorId: string; createdAt: Date | string } | null;
  userId: string;
  lastReadAt: Date | null;
}): boolean {
  if (!params.lastMessage) return false;
  const createdAt =
    typeof params.lastMessage.createdAt === "string"
      ? new Date(params.lastMessage.createdAt)
      : params.lastMessage.createdAt;
  return isUnreadMessage({
    authorId: params.lastMessage.authorId,
    createdAt,
    userId: params.userId,
    lastReadAt: params.lastReadAt,
  });
}

export function lastReadAtIso(lastReadAt: Date | null | undefined): string | null {
  return lastReadAt?.toISOString() ?? null;
}

export async function unreadFlagsForConversations(
  conversationIds: string[],
  userId: string,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (conversationIds.length === 0) return result;

  const memberRows = await db
    .select({
      conversationId: conversationMembers.conversationId,
      lastReadAt: conversationMembers.lastReadAt,
      muted: conversationMembers.muted,
    })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.userId, userId),
        inArray(conversationMembers.conversationId, conversationIds),
      ),
    );

  const lastReadByConv = new Map(
    memberRows.map((row) => [row.conversationId, row.lastReadAt]),
  );
  const mutedByConv = new Map(memberRows.map((row) => [row.conversationId, row.muted]));

  const lastByConv = await fetchLastMessagesForConversations(conversationIds);

  for (const conversationId of conversationIds) {
    if (mutedByConv.get(conversationId)) {
      result.set(conversationId, false);
      continue;
    }

    const last = lastByConv.get(conversationId);
    const lastReadAt = lastReadByConv.get(conversationId) ?? null;
    result.set(
      conversationId,
      hasUnreadFromLastMessage({ lastMessage: last, userId, lastReadAt }),
    );
  }

  return result;
}

export async function countUnreadConversations(userId: string): Promise<number> {
  const memberships = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  const conversationIds = memberships.map((row) => row.conversationId);
  if (conversationIds.length === 0) return 0;

  const flags = await unreadFlagsForConversations(conversationIds, userId);
  let count = 0;
  for (const hasUnread of flags.values()) {
    if (hasUnread) count += 1;
  }
  return count;
}
