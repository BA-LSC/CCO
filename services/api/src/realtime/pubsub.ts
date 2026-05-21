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

let useRedis = false;

export function configurePubSub(): void {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    initRedisPubSub(redisUrl);
    useRedis = true;
  }
}

export type { RealtimeEvent } from "./events";

export function subscribeToConversation(
  conversationId: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  if (useRedis) return subscribeToConversationRedis(conversationId, listener);
  return subscribeToConversationMemory(conversationId, listener);
}

export async function publishMessageEvent(event: RealtimeEvent): Promise<void> {
  if (useRedis) {
    await publishMessageEventRedis(event);
    return;
  }
  publishMessageEventMemory(event);
}

export function resetPubSubForTests(): void {
  resetPubSubMemoryForTests();
  useRedis = false;
}
