import Redis from "ioredis";

const PRESENCE_KEY_PREFIX = "cco:presence:";
export const PRESENCE_TTL_SECONDS = 60;

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

  const pipeline = client.pipeline();
  for (const userId of userIds) {
    pipeline.exists(presenceKey(userId));
  }

  const replies = await pipeline.exec();
  userIds.forEach((userId, index) => {
    online[userId] = replies?.[index]?.[1] === 1;
  });

  return online;
}
