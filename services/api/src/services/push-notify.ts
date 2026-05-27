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
import { enqueuePushNotification, isPushQueueEnabled } from "./push-queue";

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
  icon?: string | null;
  image?: string | null;
  kind?: "message" | "call";
  callId?: string;
}): Promise<void> {
  if (params.userIds.length === 0) return;

  const queued =
    isPushQueueEnabled() &&
    (await enqueuePushNotification({
      kind: params.kind ?? "message",
      userIds: params.userIds,
      title: params.title,
      body: params.body,
      url: appendNotificationAnchorToUrl(params.url),
      conversationId: params.conversationId,
      icon: params.icon ?? null,
      image: params.image ?? null,
      callId: params.callId,
    }));

  if (queued) return;

  const [expoTokens, webSubscriptions] = await Promise.all([
    collectPushTokens(params.userIds),
    collectWebPushSubscriptions(params.userIds),
  ]);

  const payload = {
    title: params.title,
    body: params.body,
    url: appendNotificationAnchorToUrl(params.url),
    conversationId: params.conversationId,
    icon: params.icon ?? null,
    image: params.image ?? null,
  };

  await Promise.all([
    sendExpoPush(expoTokens, params.title, params.body, params.url, params.callId ? { type: "call", callId: params.callId } : undefined),
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

  const content = await buildMessageNotificationContent({ message, meta });

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
    const content = await buildMessageNotificationContent({
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

  const content = await buildMessageNotificationContent({ message: params.message, meta });
  await notifyUsersOfMessage({
    userIds: otherIds,
    conversationId: params.conversationId,
    url: meta.url,
    ...content,
  });
}

export async function notifyIncomingCall(params: {
  callId: string;
  conversationId: string;
  hostUserId: string;
  hostDisplayName: string;
  targetUserIds?: string[];
}): Promise<void> {
  const meta = await resolveConversationNotificationMeta(params.conversationId);
  const callUrl = `${meta.url}?call=${encodeURIComponent(params.callId)}`;

  const userIds =
    params.targetUserIds ??
    (await listUnmutedConversationMemberIds({
      conversationId: params.conversationId,
      excludeUserId: params.hostUserId,
    }));

  if (userIds.length === 0) return;

  const title = meta.title;
  const body = `${params.hostDisplayName} started a call`;

  await notifyUsersOfMessage({
    userIds,
    conversationId: params.conversationId,
    url: callUrl,
    title,
    body,
    kind: "call",
    callId: params.callId,
  });
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  url: string,
  extraData?: Record<string, string>,
): Promise<void> {
  const { sendExpoPushDirect } = await import("./push-delivery");
  await sendExpoPushDirect(tokens, title, body, url, extraData);
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
