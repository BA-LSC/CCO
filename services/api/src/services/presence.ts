import { and, eq, inArray } from "drizzle-orm";
import Redis from "ioredis";
import { db } from "../db";
import { conversationMembers, users } from "../db/schema";
import { kvMget, kvMgetBinding, kvPut, kvPutBinding, resolvePresenceKvConfig } from "../lib/cloudflare-kv";
import { getWorkerBindings } from "../runtime/worker-context";
import { PRESENCE_KEY_PREFIX, PRESENCE_TTL_SECONDS, presenceKey } from "../realtime/presence-keys";

export { PRESENCE_TTL_SECONDS };

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) redis = new Redis(url);
  return redis;
}

async function shouldUseKvPresence(): Promise<boolean> {
  if (getWorkerBindings()?.PRESENCE_KV) return true;
  if (process.env.CF_PRESENCE_KV === "1") return true;
  if (process.env.REDIS_URL) return false;
  try {
    return Boolean(await resolvePresenceKvConfig());
  } catch {
    return false;
  }
}

/** Mark a user as actively viewing the app (page visible). */
export async function touchUserPresence(userId: string, callId?: string | null): Promise<void> {
  const value = callId ? `call:${callId}` : "1";

  if (await shouldUseKvPresence()) {
    const binding = getWorkerBindings()?.PRESENCE_KV;
    if (binding) {
      await kvPutBinding(binding, presenceKey(userId), value, PRESENCE_TTL_SECONDS);
      return;
    }
    const kv = await resolvePresenceKvConfig();
    if (kv) {
      await kvPut(kv, presenceKey(userId), value, PRESENCE_TTL_SECONDS);
      return;
    }
  }

  const client = getRedis();
  if (!client) return;
  await client.set(presenceKey(userId), value, "EX", PRESENCE_TTL_SECONDS);
}

/** Returns online map and optional active call ids per user. */
export async function getUsersPresenceState(
  userIds: string[],
): Promise<{ online: Record<string, boolean>; inCall: Record<string, string | null> }> {
  const online: Record<string, boolean> = {};
  const inCall: Record<string, string | null> = {};
  for (const userId of userIds) {
    online[userId] = false;
    inCall[userId] = null;
  }

  if (userIds.length === 0) return { online, inCall };

  if (await shouldUseKvPresence()) {
    const binding = getWorkerBindings()?.PRESENCE_KV;
    if (binding) {
      const values = await kvMgetBinding(
        binding,
        userIds.map(presenceKey),
      );
      userIds.forEach((userId, index) => {
        const raw = values[index];
        online[userId] = raw != null;
        if (raw?.startsWith("call:")) {
          inCall[userId] = raw.slice("call:".length) || null;
        }
      });
      return { online, inCall };
    }
    const kv = await resolvePresenceKvConfig();
    if (kv) {
      const values = await kvMget(
        kv,
        userIds.map(presenceKey),
      );
      userIds.forEach((userId, index) => {
        const raw = values[index];
        online[userId] = raw != null;
        if (raw?.startsWith("call:")) {
          inCall[userId] = raw.slice("call:".length) || null;
        }
      });
      return { online, inCall };
    }
  }

  const client = getRedis();
  if (!client) return { online, inCall };

  const values = await client.mget(...userIds.map(presenceKey));
  userIds.forEach((userId, index) => {
    const raw = values[index];
    online[userId] = raw != null;
    if (raw?.startsWith("call:")) {
      inCall[userId] = raw.slice("call:".length) || null;
    }
  });

  return { online, inCall };
}

/** Batch lookup for online users based on recent heartbeats. */
export async function getUsersOnline(userIds: string[]): Promise<Record<string, boolean>> {
  return (await getUsersPresenceState(userIds)).online;
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

/** @internal */
export { PRESENCE_KEY_PREFIX };
