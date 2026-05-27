import { inArray } from "drizzle-orm";
import { db } from "../db";
import { pushTokens } from "../db/schema";
import { collectWebPushSubscriptions, sendWebPushNotifications } from "./web-push";

export async function collectPushTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ token: pushTokens.expoPushToken })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  return rows.map((r) => r.token);
}

export async function sendExpoPushDirect(
  tokens: string[],
  title: string,
  body: string,
  url: string,
  extraData?: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title,
    body,
    data: { url, ...extraData },
  }));

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
}

export async function sendWebPushDirect(
  subscriptions: Awaited<ReturnType<typeof collectWebPushSubscriptions>>,
  payload: {
    title: string;
    body: string;
    url: string;
    conversationId: string;
    icon?: string | null;
    image?: string | null;
  },
): Promise<void> {
  await sendWebPushNotifications(subscriptions, payload);
}

export { collectWebPushSubscriptions };
