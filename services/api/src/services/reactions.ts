import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers, messageReactions, messages, users } from "../db/schema";
import { publishMessageEventToMembers } from "../realtime/pubsub";
import { listConversationMemberUserIds } from "./conversations";

export type ReactionDto = {
  messageId: string;
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
};

async function canAccessMessage(messageId: string, userId: string): Promise<boolean> {
  const row = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(eq(messages.id, messageId))
    .limit(1);

  return Boolean(row[0]);
}

export async function listReactionsForMessage(
  messageId: string,
  userId: string,
): Promise<ReactionDto[] | null> {
  if (!(await canAccessMessage(messageId, userId))) return null;

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
    .where(eq(messageReactions.messageId, messageId));

  return rows.map((r) => ({
    messageId: r.messageId,
    userId: r.userId,
    userName: r.userName,
    emoji: r.emoji,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addReaction(params: {
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<{ reaction: ReactionDto } | { error: string; status: number }> {
  const message = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, params.messageId))
    .limit(1);

  if (!message[0]) return { error: "Not found", status: 404 };
  if (!(await canAccessMessage(params.messageId, params.userId))) {
    return { error: "Forbidden", status: 403 };
  }

  await db
    .insert(messageReactions)
    .values({
      messageId: params.messageId,
      userId: params.userId,
      emoji: params.emoji,
    })
    .onConflictDoNothing();

  const user = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const reaction: ReactionDto = {
    messageId: params.messageId,
    userId: params.userId,
    userName: user[0]?.displayName ?? "Unknown",
    emoji: params.emoji,
    createdAt: new Date().toISOString(),
  };

  const memberUserIds = await listConversationMemberUserIds(message[0].conversationId);
  await publishMessageEventToMembers(
    {
      type: "reaction.changed",
      conversationId: message[0].conversationId,
      messageId: params.messageId,
      action: "added",
      reaction,
    },
    memberUserIds,
  );

  return { reaction };
}

export async function removeReaction(params: {
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const message = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, params.messageId))
    .limit(1);

  if (!message[0]) return { error: "Not found", status: 404 };
  if (!(await canAccessMessage(params.messageId, params.userId))) {
    return { error: "Forbidden", status: 403 };
  }

  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, params.messageId),
        eq(messageReactions.userId, params.userId),
        eq(messageReactions.emoji, params.emoji),
      ),
    );

  const memberUserIds = await listConversationMemberUserIds(message[0].conversationId);
  await publishMessageEventToMembers(
    {
      type: "reaction.changed",
      conversationId: message[0].conversationId,
      messageId: params.messageId,
      action: "removed",
      reaction: {
        messageId: params.messageId,
        userId: params.userId,
        userName: "",
        emoji: params.emoji,
        createdAt: new Date().toISOString(),
      },
    },
    memberUserIds,
  );

  return { ok: true };
}
