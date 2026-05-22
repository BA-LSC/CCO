import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  groups,
  pushTokens,
  serviceTeams,
} from "../db/schema";
import type { MessageDto } from "./messages";
import {
  buildMessageNotificationContent,
  type ConversationNotificationMeta,
} from "./notification-format";
import { appendNotificationAnchorToUrl } from "@cco/shared/notification-navigation";
import { collectWebPushSubscriptions, sendWebPushNotifications } from "./web-push";

async function collectPushTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ token: pushTokens.expoPushToken })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  return rows.map((r) => r.token);
}

async function listUnmutedMemberIds(
  conversationId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        inArray(conversationMembers.userId, userIds),
        eq(conversationMembers.muted, false),
      ),
    );

  return rows.map((row) => row.userId);
}

async function listUnmutedConversationMemberIds(params: {
  conversationId: string;
  excludeUserId: string;
  excludeUserIds?: string[];
}): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, params.conversationId),
        ne(conversationMembers.userId, params.excludeUserId),
        eq(conversationMembers.muted, false),
      ),
    );

  const excluded = new Set(params.excludeUserIds ?? []);
  return rows.map((row) => row.userId).filter((userId) => !excluded.has(userId));
}

async function resolveConversationNotificationMeta(
  conversationId: string,
): Promise<ConversationNotificationMeta> {
  const row = await db
    .select({
      groupId: conversations.groupId,
      serviceTeamId: conversations.serviceTeamId,
      dmPairKey: conversations.dmPairKey,
      conversationTitle: conversations.title,
      groupName: groups.name,
      teamName: serviceTeams.name,
    })
    .from(conversations)
    .leftJoin(groups, eq(groups.id, conversations.groupId))
    .leftJoin(serviceTeams, eq(serviceTeams.id, conversations.serviceTeamId))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const conv = row[0];
  if (!conv) return { url: "/", title: "CCO", kind: "dm" };

  if (conv.groupId) {
    let title = conv.groupName?.trim() || "Group";
    const channel = conv.conversationTitle?.trim();
    if (channel && channel.toLowerCase() !== "general") {
      title = `${title} · ${channel}`;
    }
    return {
      url: `/groups/${conv.groupId}/c/${conversationId}`,
      title,
      kind: "group",
    };
  }

  if (conv.serviceTeamId) {
    return {
      url: `/teams/${conv.serviceTeamId}`,
      title: conv.teamName?.trim() || "Team",
      kind: "team",
    };
  }

  if (conv.dmPairKey) {
    return {
      url: `/dms/${conversationId}`,
      title: "Message",
      kind: "dm",
    };
  }

  return { url: "/", title: "CCO", kind: "dm" };
}

async function notifyUsersOfMessage(params: {
  userIds: string[];
  conversationId: string;
  url: string;
  title: string;
  body: string;
  image?: string | null;
}): Promise<void> {
  if (params.userIds.length === 0) return;

  const [expoTokens, webSubscriptions] = await Promise.all([
    collectPushTokens(params.userIds),
    collectWebPushSubscriptions(params.userIds),
  ]);

  const payload = {
    title: params.title,
    body: params.body,
    url: appendNotificationAnchorToUrl(params.url),
    conversationId: params.conversationId,
    image: params.image ?? null,
  };

  await Promise.all([
    sendExpoPush(expoTokens, params.title, params.body, params.url),
    sendWebPushNotifications(webSubscriptions, payload),
  ]);
}

export async function notifyConversationOfMessage(
  conversationId: string,
  authorUserId: string,
  message: MessageDto,
): Promise<void> {
  const [userIds, meta] = await Promise.all([
    listUnmutedConversationMemberIds({
      conversationId,
      excludeUserId: authorUserId,
    }),
    resolveConversationNotificationMeta(conversationId),
  ]);

  const content = buildMessageNotificationContent({ message, meta });

  await notifyUsersOfMessage({
    userIds,
    conversationId,
    url: meta.url,
    ...content,
  });
}

export async function notifyMentionedUsers(params: {
  conversationId: string;
  authorUserId: string;
  mentionedUserIds: string[];
  message: MessageDto;
}): Promise<void> {
  const meta = await resolveConversationNotificationMeta(params.conversationId);
  const mentioned = params.mentionedUserIds.filter((id) => id !== params.authorUserId);
  const unmutedMentioned = await listUnmutedMemberIds(params.conversationId, mentioned);
  if (unmutedMentioned.length > 0) {
    const content = buildMessageNotificationContent({
      message: params.message,
      meta,
      mention: true,
    });
    await notifyUsersOfMessage({
      userIds: unmutedMentioned,
      conversationId: params.conversationId,
      url: meta.url,
      ...content,
    });
  }

  const otherIds = await listUnmutedConversationMemberIds({
    conversationId: params.conversationId,
    excludeUserId: params.authorUserId,
    excludeUserIds: mentioned,
  });

  const content = buildMessageNotificationContent({ message: params.message, meta });
  await notifyUsersOfMessage({
    userIds: otherIds,
    conversationId: params.conversationId,
    url: meta.url,
    ...content,
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
