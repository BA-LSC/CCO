import Redis from "ioredis";
import type { RealtimeEvent } from "./events";
import { redisChannelForConversation } from "./events";
import { publishMessageEventMemory, subscribeToConversationMemory } from "./pubsub-memory";

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let initialized = false;

const CHANNEL_PATTERN = "connect:conversation:*";

export function initRedisPubSub(redisUrl: string): void {
  if (initialized) return;
  publisher = new Redis(redisUrl);
  subscriber = new Redis(redisUrl);

  void subscriber.psubscribe(CHANNEL_PATTERN);

  subscriber.on("pmessage", (_pattern, channel, payload) => {
    try {
      const event = JSON.parse(payload) as RealtimeEvent;
      const prefix = "connect:conversation:";
      if (!channel.startsWith(prefix)) return;
      const channelConversationId = channel.slice(prefix.length);
      if (channelConversationId !== event.conversationId) {
        console.warn(
          "Redis pubsub channel/event conversationId mismatch:",
          channel,
          event.conversationId,
        );
        return;
      }
      publishMessageEventMemory(event);
    } catch (err) {
      console.warn("Invalid redis pubsub payload:", err);
    }
  });

  initialized = true;
  console.log("Redis pub/sub enabled for realtime messaging");
}

export function subscribeToConversationRedis(
  conversationId: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  return subscribeToConversationMemory(conversationId, listener);
}

export async function publishMessageEventRedis(event: RealtimeEvent): Promise<void> {
  const channel = redisChannelForConversation(event.conversationId);
  await publisher?.publish(channel, JSON.stringify(event));
  publishMessageEventMemory(event);
}

export async function shutdownRedisPubSub(): Promise<void> {
  await publisher?.quit();
  await subscriber?.quit();
  publisher = null;
  subscriber = null;
  initialized = false;
}
