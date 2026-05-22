import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { webPushSubscriptions } from "../db/schema";
import { resolveVapidConfig } from "./org-vapid";

export type WebPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

export async function getVapidPublicKey(): Promise<string | null> {
  const config = await resolveVapidConfig();
  return config?.publicKey ?? null;
}

export async function registerWebPushSubscription(
  userId: string,
  subscription: WebPushSubscriptionInput,
): Promise<void> {
  await db
    .insert(webPushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: subscription.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: [webPushSubscriptions.userId, webPushSubscriptions.endpoint],
      set: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: subscription.userAgent ?? null,
      },
    });
}

export async function unregisterWebPushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(webPushSubscriptions)
    .where(
      and(
        eq(webPushSubscriptions.userId, userId),
        eq(webPushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function collectWebPushSubscriptions(
  userIds: string[],
): Promise<Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>> {
  if (userIds.length === 0) return [];

  const rows = await db
    .select({
      endpoint: webPushSubscriptions.endpoint,
      p256dh: webPushSubscriptions.p256dh,
      auth: webPushSubscriptions.auth,
    })
    .from(webPushSubscriptions)
    .where(inArray(webPushSubscriptions.userId, userIds));

  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

export async function sendWebPushNotifications(
  subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
  payload: {
    title: string;
    body: string;
    url: string;
    conversationId: string;
    image?: string | null;
  },
): Promise<void> {
  const vapid = await resolveVapidConfig();
  if (!vapid || subscriptions.length === 0) return;

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    conversationId: payload.conversationId,
    ...(payload.image ? { image: payload.image } : {}),
  });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          body,
        );
      } catch (err) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: number }).statusCode)
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(webPushSubscriptions)
            .where(eq(webPushSubscriptions.endpoint, subscription.endpoint));
        } else {
          console.warn("Web push failed:", err);
        }
      }
    }),
  );
}
