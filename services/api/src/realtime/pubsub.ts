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

/** Resolve pubsub backend; Cloudflare service bindings only exist inside a request scope. */
function resolvePubSubBackend(): PubSubBackend {
  if (isCloudflarePubSubEnabled()) {
    if (backend !== "cloudflare") {
      initCloudflarePubSub();
      backend = "cloudflare";
    }
    return "cloudflare";
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    if (backend !== "redis") {
      initRedisPubSub(redisUrl);
      backend = "redis";
    }
    return "redis";
  }

  return "memory";
}

export function configurePubSub(): void {
  resolvePubSubBackend();
}

export type { RealtimeEvent } from "./events";

export function subscribeToConversation(
  conversationId: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  const activeBackend = resolvePubSubBackend();
  if (activeBackend === "cloudflare") return subscribeToConversationCloudflare(conversationId, listener);
  if (activeBackend === "redis") return subscribeToConversationRedis(conversationId, listener);
  return subscribeToConversationMemory(conversationId, listener);
}

export async function publishMessageEvent(event: RealtimeEvent): Promise<void> {
  const activeBackend = resolvePubSubBackend();
  if (activeBackend === "cloudflare") {
    await publishMessageEventCloudflare(event);
    return;
  }
  if (activeBackend === "redis") {
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
  const activeBackend = resolvePubSubBackend();
  await publishMessageEvent(event);
  if (activeBackend === "cloudflare") {
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
