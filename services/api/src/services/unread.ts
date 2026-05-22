import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers, messages } from "../db/schema";

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

  const lastMessages = await db
    .select({
      conversationId: messages.conversationId,
      authorId: messages.authorId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(inArray(messages.conversationId, conversationIds), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt));

  const lastByConv = new Map<string, { authorId: string; createdAt: Date }>();
  for (const msg of lastMessages) {
    if (!lastByConv.has(msg.conversationId)) {
      lastByConv.set(msg.conversationId, {
        authorId: msg.authorId,
        createdAt: msg.createdAt,
      });
    }
  }

  for (const conversationId of conversationIds) {
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
