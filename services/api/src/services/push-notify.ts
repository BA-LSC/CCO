import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers, conversations, pushTokens } from "../db/schema";
import type { MessageDto } from "./messages";
import { collectWebPushSubscriptions, sendWebPushNotifications } from "./web-push";

async function collectPushTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ token: pushTokens.expoPushToken })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  return rows.map((r) => r.token);
}

async function resolveConversationDeepLink(conversationId: string): Promise<string> {
  const row = await db
    .select({
      groupId: conversations.groupId,
      serviceTeamId: conversations.serviceTeamId,
      dmPairKey: conversations.dmPairKey,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const conv = row[0];
  if (!conv) return "/";
  if (conv.groupId) return `/groups/${conv.groupId}/c/${conversationId}`;
  if (conv.serviceTeamId) return `/teams/${conv.serviceTeamId}`;
  if (conv.dmPairKey) return `/dms/${conversationId}`;
  return "/";
}

async function notifyUsersOfMessage(params: {
  userIds: string[];
  conversationId: string;
  title: string;
  body: string;
}): Promise<void> {
  if (params.userIds.length === 0) return;

  const [expoTokens, webSubscriptions, url] = await Promise.all([
    collectPushTokens(params.userIds),
    collectWebPushSubscriptions(params.userIds),
    resolveConversationDeepLink(params.conversationId),
  ]);

  const payload = {
    title: params.title,
    body: params.body,
    url,
    conversationId: params.conversationId,
  };

  await Promise.all([
    sendExpoPush(expoTokens, params.title, params.body, url),
    sendWebPushNotifications(webSubscriptions, payload),
  ]);
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

  const title = message.authorName;
  const body = message.attachmentUrl
    ? message.body.trim() || "Sent an image"
    : message.body.slice(0, 120);

  await notifyUsersOfMessage({
    userIds: members.map((m) => m.userId),
    conversationId,
    title,
    body,
  });
}

export async function notifyMentionedUsers(params: {
  conversationId: string;
  authorUserId: string;
  mentionedUserIds: string[];
  message: MessageDto;
}): Promise<void> {
  const mentioned = params.mentionedUserIds.filter((id) => id !== params.authorUserId);
  if (mentioned.length > 0) {
    await notifyUsersOfMessage({
      userIds: mentioned,
      conversationId: params.conversationId,
      title: `${params.message.authorName} mentioned you`,
      body: params.message.body.slice(0, 120) || "New mention",
    });
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

  const title = params.message.authorName;
  const body = params.message.body.slice(0, 120);
  await notifyUsersOfMessage({
    userIds: otherIds,
    conversationId: params.conversationId,
    title,
    body,
  });
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  url: string,
): Promise<void> {
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title,
    body,
    data: { url },
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

export {
  getVapidPublicKey,
  registerWebPushSubscription,
  unregisterWebPushSubscription,
} from "./web-push";
