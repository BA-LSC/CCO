import { and, eq, inArray } from "drizzle-orm";
import Redis from "ioredis";
import { db } from "../db";
import { conversationMembers, users } from "../db/schema";

const PRESENCE_KEY_PREFIX = "cco:presence:";
export const PRESENCE_TTL_SECONDS = 45;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) redis = new Redis(url);
  return redis;
}

function presenceKey(userId: string): string {
  return `${PRESENCE_KEY_PREFIX}${userId}`;
}

/** Mark a user as actively viewing the app (page visible). */
export async function touchUserPresence(userId: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.set(presenceKey(userId), "1", "EX", PRESENCE_TTL_SECONDS);
}

/** Batch lookup for online users based on recent heartbeats. */
export async function getUsersOnline(userIds: string[]): Promise<Record<string, boolean>> {
  const online: Record<string, boolean> = {};
  for (const userId of userIds) online[userId] = false;

  const client = getRedis();
  if (!client || userIds.length === 0) return online;

  const values = await client.mget(...userIds.map(presenceKey));
  userIds.forEach((userId, index) => {
    online[userId] = values[index] != null;
  });

  return online;
}

/** Users whose presence the viewer is allowed to see. */
export async function resolvePresenceVisibleUserIds(
  viewerUserId: string,
  organizationId: string,
  requestedUserIds: string[],
): Promise<string[]> {
  const unique = [...new Set(requestedUserIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const allowed = new Set<string>();

  for (const userId of unique) {
    if (userId === viewerUserId) allowed.add(userId);
  }

  const sameOrgRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), eq(users.organizationId, organizationId)));

  for (const row of sameOrgRows) allowed.add(row.id);

  const viewerConversations = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, viewerUserId));

  const conversationIds = viewerConversations.map((row) => row.conversationId);
  if (conversationIds.length > 0) {
    const coMemberRows = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          inArray(conversationMembers.conversationId, conversationIds),
          inArray(conversationMembers.userId, unique),
        ),
      );

    for (const row of coMemberRows) allowed.add(row.userId);
  }

  return [...allowed];
}
