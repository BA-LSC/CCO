import type { RealtimeEvent } from "./events";
import {
  publishMessageEventMemory,
  resetPubSubMemoryForTests,
  subscribeToConversationMemory,
} from "./pubsub-memory";
import {
  initRedisPubSub,
  publishMessageEventRedis,
  subscribeToConversationRedis,
} from "./pubsub-redis";
import {
  fireAndForgetPublishToUsers,
  initCloudflarePubSub,
  isCloudflarePubSubEnabled,
  publishMessageEventCloudflare,
  subscribeToConversationCloudflare,
} from "./pubsub-cloudflare";

type PubSubBackend = "memory" | "redis" | "cloudflare";

let backend: PubSubBackend = "memory";

export function configurePubSub(): void {
  if (isCloudflarePubSubEnabled()) {
    initCloudflarePubSub();
    backend = "cloudflare";
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    initRedisPubSub(redisUrl);
    backend = "redis";
  }
}

export type { RealtimeEvent } from "./events";

export function subscribeToConversation(
  conversationId: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  if (backend === "cloudflare") return subscribeToConversationCloudflare(conversationId, listener);
  if (backend === "redis") return subscribeToConversationRedis(conversationId, listener);
  return subscribeToConversationMemory(conversationId, listener);
}

export async function publishMessageEvent(event: RealtimeEvent): Promise<void> {
  if (backend === "cloudflare") {
    await publishMessageEventCloudflare(event);
    return;
  }
  if (backend === "redis") {
    await publishMessageEventRedis(event);
    return;
  }
  publishMessageEventMemory(event);
}

/** Publish to the active conversation room and each member's user inbox (Cloudflare). */
export async function publishMessageEventToMembers(
  event: RealtimeEvent,
  memberUserIds: string[],
): Promise<void> {
  await publishMessageEvent(event);
  if (backend === "cloudflare") {
    fireAndForgetPublishToUsers(memberUserIds, event);
  }
}

export function resetPubSubForTests(): void {
  resetPubSubMemoryForTests();
  backend = "memory";
}

export function getPubSubBackendForTests(): PubSubBackend {
  return backend;
}
