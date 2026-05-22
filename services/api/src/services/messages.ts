import { and, asc, desc, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  groupMemberships,
  groups,
  messageReactions,
  messages,
  users,
} from "../db/schema";
import { extractMentionedUserIds } from "../lib/mentions";
import { isAllowedAttachmentUrl, refreshAttachmentUrl } from "../lib/uploads";
import { directMessageParticipantsAreSignedUp } from "./dms";
import { markConversationRead } from "./conversations";
import { canDeleteMessage, canPostInConversation } from "../permissions";
import { publishMessageEvent } from "../realtime/pubsub";
import { notifyConversationOfMessage, notifyMentionedUsers } from "./push-notify";
import { refreshUserAvatarFromPco } from "./user-profile";
import { lastReadAtIso } from "./unread";
import type { ReactionDto } from "./reactions";

export type MessageDto = {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  body: string;
  attachmentUrl: string | null;
  messageType: string;
  clientMessageId: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions?: ReactionDto[];
};

type MessageRow = {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  attachmentUrl: string | null;
  messageType: string;
  clientMessageId: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  authorName: string;
  authorAvatarUrl?: string | null;
};

function toDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl ?? null,
    body: row.body,
    attachmentUrl: refreshAttachmentUrl(row.attachmentUrl),
    messageType: row.messageType,
    clientMessageId: row.clientMessageId,
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const messageSelect = {
  id: messages.id,
  conversationId: messages.conversationId,
  authorId: messages.authorId,
  body: messages.body,
  attachmentUrl: messages.attachmentUrl,
  messageType: messages.messageType,
  clientMessageId: messages.clientMessageId,
  editedAt: messages.editedAt,
  deletedAt: messages.deletedAt,
  createdAt: messages.createdAt,
  authorName: users.displayName,
  authorAvatarUrl: users.avatarUrl,
};

async function getMembershipForConversation(conversationId: string, userId: string) {
  const groupRow = await db
    .select({
      role: groupMemberships.role,
      leaderOnly: conversations.leaderOnly,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .leftJoin(groups, eq(groups.id, conversations.groupId))
    .leftJoin(
      groupMemberships,
      and(eq(groupMemberships.groupId, groups.id), eq(groupMemberships.userId, userId)),
    )
    .where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)),
    )
    .limit(1);

  if (groupRow[0]?.role) return groupRow[0];

  const memberOnly = await db
    .select({ id: conversationMembers.id, leaderOnly: conversations.leaderOnly })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)),
    )
    .limit(1);

  if (memberOnly[0]) {
    return { role: "member", leaderOnly: memberOnly[0].leaderOnly };
  }

  return null;
}

async function attachReactions(messageIds: string[]): Promise<Map<string, ReactionDto[]>> {
  if (messageIds.length === 0) return new Map();

  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      userId: messageReactions.userId,
      emoji: messageReactions.emoji,
      createdAt: messageReactions.createdAt,
      userName: users.displayName,
    })
    .from(messageReactions)
    .innerJoin(users, eq(users.id, messageReactions.userId))
    .where(inArray(messageReactions.messageId, messageIds));

  const map = new Map<string, ReactionDto[]>();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    list.push({
      messageId: row.messageId,
      userId: row.userId,
      userName: row.userName,
      emoji: row.emoji,
      createdAt: row.createdAt.toISOString(),
    });
    map.set(row.messageId, list);
  }
  return map;
}

export async function listMessages(
  conversationId: string,
  userId: string,
  options?: { limit?: number; before?: string; anchorUnread?: boolean },
): Promise<{
  messages: MessageDto[];
  hasMore: boolean;
  firstUnreadMessageId: string | null;
  lastReadAt: string | null;
  canPost: boolean;
} | null> {
  const member = await db
    .select({ id: conversationMembers.id, lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!member[0]) return null;

  const lastReadAt = member[0].lastReadAt;
  const limit = Math.min(options?.limit ?? 50, 100);
  const baseConditions = [
    eq(messages.conversationId, conversationId),
    isNull(messages.deletedAt),
  ];

  let firstUnreadMessageId: string | null = null;

  const unreadConditions = [...baseConditions, ne(messages.authorId, userId)];
  if (lastReadAt) {
    unreadConditions.push(gt(messages.createdAt, lastReadAt));
  }

  const firstUnread = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(...unreadConditions))
    .orderBy(asc(messages.createdAt))
    .limit(1);

  firstUnreadMessageId = firstUnread[0]?.id ?? null;

  async function fetchPage(whereExtra?: ReturnType<typeof and>, order: "desc" | "asc" = "desc") {
    const conditions = whereExtra ? [...baseConditions, whereExtra] : baseConditions;
    const rows = await db
      .select(messageSelect)
      .from(messages)
      .innerJoin(users, eq(users.id, messages.authorId))
      .where(and(...conditions))
      .orderBy(order === "desc" ? desc(messages.createdAt) : asc(messages.createdAt))
      .limit(limit + 1);
    return rows;
  }

  let rows: MessageRow[] = [];
  let hasMore = false;

  if (options?.before) {
    const anchor = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, options.before))
      .limit(1);
    if (anchor[0]) {
      const pageRows = await fetchPage(lt(messages.createdAt, anchor[0].createdAt));
      hasMore = pageRows.length > limit;
      rows = (hasMore ? pageRows.slice(0, limit) : pageRows).reverse() as MessageRow[];
    }
  } else if (options?.anchorUnread && firstUnreadMessageId) {
    const anchor = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, firstUnreadMessageId))
      .limit(1);

    if (anchor[0]) {
      const contextBefore = await db
        .select(messageSelect)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.authorId))
        .where(and(...baseConditions, lt(messages.createdAt, anchor[0].createdAt)))
        .orderBy(desc(messages.createdAt))
        .limit(6);

      const fromUnread = await db
        .select(messageSelect)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.authorId))
        .where(and(...baseConditions, gt(messages.createdAt, anchor[0].createdAt)))
        .orderBy(asc(messages.createdAt))
        .limit(limit);

      const anchorRow = await db
        .select(messageSelect)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.authorId))
        .where(eq(messages.id, firstUnreadMessageId))
        .limit(1);

      const context = contextBefore.reverse() as MessageRow[];
      hasMore = contextBefore.length === 6;
      rows = [
        ...context,
        ...(anchorRow as MessageRow[]),
        ...(fromUnread as MessageRow[]),
      ];
    }
  } else {
    const pageRows = await fetchPage();
    hasMore = pageRows.length > limit;
    rows = (hasMore ? pageRows.slice(0, limit) : pageRows).reverse() as MessageRow[];
  }

  const reactionMap = await attachReactions(rows.map((r) => r.id));

  const seenIds = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });

  const messagesDto = uniqueRows.map((row) => ({
    ...toDto(row),
    reactions: reactionMap.get(row.id) ?? [],
  }));

  const postingMembership = await getMembershipForConversation(conversationId, userId);
  const canPost = postingMembership
    ? canPostInConversation({
        membershipRole: postingMembership.role,
        leaderOnly: postingMembership.leaderOnly,
      })
    : false;

  return {
    messages: messagesDto,
    hasMore,
    firstUnreadMessageId,
    lastReadAt: lastReadAtIso(lastReadAt),
    canPost,
  };
}

export async function createMessage(params: {
  conversationId: string;
  userId: string;
  body: string;
  clientMessageId: string;
  attachmentUrl?: string;
  messageType?: string;
}): Promise<{ message: MessageDto } | { error: string; status: number }> {
  const membership = await getMembershipForConversation(params.conversationId, params.userId);
  if (!membership) return { error: "Forbidden", status: 403 };

  if (!(await directMessageParticipantsAreSignedUp(params.conversationId))) {
    return { error: "This person has not joined CCO yet.", status: 403 };
  }

  if (
    !canPostInConversation({
      membershipRole: membership.role,
      leaderOnly: membership.leaderOnly,
    })
  ) {
    return { error: "Leader-only conversation", status: 403 };
  }

  const existing = await db
    .select(messageSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.authorId))
    .where(
      and(
        eq(messages.conversationId, params.conversationId),
        eq(messages.clientMessageId, params.clientMessageId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { message: toDto(existing[0]) };
  }

  if (params.attachmentUrl && !isAllowedAttachmentUrl(params.attachmentUrl)) {
    return { error: "Invalid attachment URL", status: 400 };
  }

  const messageType = params.messageType ?? (params.attachmentUrl ? "image" : "text");

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: params.conversationId,
      authorId: params.userId,
      body: params.body,
      attachmentUrl: params.attachmentUrl ?? null,
      messageType,
      clientMessageId: params.clientMessageId,
    })
    .returning({
      id: messages.id,
      conversationId: messages.conversationId,
      authorId: messages.authorId,
      body: messages.body,
      attachmentUrl: messages.attachmentUrl,
      messageType: messages.messageType,
      clientMessageId: messages.clientMessageId,
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
      createdAt: messages.createdAt,
    });

  await refreshUserAvatarFromPco(params.userId).catch((err) => {
    console.warn("Avatar refresh failed:", err instanceof Error ? err.message : err);
  });

  const author = await db
    .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const dto = toDto({
    ...inserted,
    authorName: author[0]?.displayName ?? "Unknown",
    authorAvatarUrl: author[0]?.avatarUrl ?? null,
  });

  await publishMessageEvent({
    type: "message.created",
    conversationId: params.conversationId,
    message: dto,
  });

  void markConversationRead(params.conversationId, params.userId);

  const mentionedIds = extractMentionedUserIds(params.body);
  if (mentionedIds.length > 0) {
    void notifyMentionedUsers({
      conversationId: params.conversationId,
      authorUserId: params.userId,
      mentionedUserIds: mentionedIds,
      message: dto,
    });
  } else {
    void notifyConversationOfMessage(params.conversationId, params.userId, dto);
  }

  return { message: dto };
}

export async function updateMessage(params: {
  messageId: string;
  userId: string;
  body: string;
}): Promise<{ message: MessageDto } | { error: string; status: number }> {
  const row = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      authorId: messages.authorId,
    })
    .from(messages)
    .where(eq(messages.id, params.messageId))
    .limit(1);

  if (!row[0]) return { error: "Not found", status: 404 };
  if (row[0].authorId !== params.userId) return { error: "Forbidden", status: 403 };

  const [updated] = await db
    .update(messages)
    .set({ body: params.body, editedAt: new Date() })
    .where(eq(messages.id, params.messageId))
    .returning({
      id: messages.id,
      conversationId: messages.conversationId,
      authorId: messages.authorId,
      body: messages.body,
      attachmentUrl: messages.attachmentUrl,
      messageType: messages.messageType,
      clientMessageId: messages.clientMessageId,
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
      createdAt: messages.createdAt,
    });

  const author = await db
    .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const dto = toDto({
    ...updated,
    authorName: author[0]?.displayName ?? "Unknown",
    authorAvatarUrl: author[0]?.avatarUrl ?? null,
  });

  await publishMessageEvent({
    type: "message.updated",
    conversationId: row[0].conversationId,
    message: dto,
  });

  return { message: dto };
}

export async function deleteMessage(params: {
  messageId: string;
  userId: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const row = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      authorId: messages.authorId,
    })
    .from(messages)
    .where(eq(messages.id, params.messageId))
    .limit(1);

  if (!row[0]) return { error: "Not found", status: 404 };

  const membership = await getMembershipForConversation(row[0].conversationId, params.userId);
  if (!membership) return { error: "Forbidden", status: 403 };

  if (
    !canDeleteMessage({
      authorId: row[0].authorId,
      userId: params.userId,
      membershipRole: membership.role,
    })
  ) {
    return { error: "Forbidden", status: 403 };
  }

  await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(eq(messages.id, params.messageId));

  await publishMessageEvent({
    type: "message.deleted",
    conversationId: row[0].conversationId,
    messageId: params.messageId,
  });

  return { ok: true };
}
