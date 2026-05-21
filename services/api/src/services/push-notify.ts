import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers, pushTokens } from "../db/schema";
import type { MessageDto } from "./messages";

async function collectPushTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ token: pushTokens.expoPushToken })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  return rows.map((r) => r.token);
}

export async function notifyConversationOfMessage(
  conversationId: string,
  authorUserId: string,
  message: MessageDto,
): Promise<void> {
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        ne(conversationMembers.userId, authorUserId),
        eq(conversationMembers.muted, false),
      ),
    );

  const tokens = await collectPushTokens(members.map((m) => m.userId));
  if (tokens.length === 0) return;

  const title = message.authorName;
  const body = message.attachmentUrl
    ? message.body.trim() || "Sent an image"
    : message.body.slice(0, 120);

  await sendExpoPush(tokens, title, body);
}

export async function notifyMentionedUsers(params: {
  conversationId: string;
  authorUserId: string;
  mentionedUserIds: string[];
  message: MessageDto;
}): Promise<void> {
  const mentioned = params.mentionedUserIds.filter((id) => id !== params.authorUserId);
  const mentionTokens = await collectPushTokens(mentioned);
  if (mentionTokens.length > 0) {
    await sendExpoPush(
      mentionTokens,
      `${params.message.authorName} mentioned you`,
      params.message.body.slice(0, 120) || "New mention",
    );
  }

  const others = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, params.conversationId),
        ne(conversationMembers.userId, params.authorUserId),
        eq(conversationMembers.muted, false),
      ),
    );

  const otherIds = others
    .map((m) => m.userId)
    .filter((id) => !mentioned.includes(id));

  const otherTokens = await collectPushTokens(otherIds);
  if (otherTokens.length === 0) return;

  const title = params.message.authorName;
  const body = params.message.body.slice(0, 120);
  await sendExpoPush(otherTokens, title, body);
}

async function sendExpoPush(tokens: string[], title: string, body: string): Promise<void> {
  const messages = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title,
    body,
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.warn("Expo push failed:", await res.text());
    }
  } catch (err) {
    console.warn("Expo push error:", err);
  }
}

export async function registerPushToken(userId: string, expoPushToken: string): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ userId, expoPushToken })
    .onConflictDoNothing();
}
