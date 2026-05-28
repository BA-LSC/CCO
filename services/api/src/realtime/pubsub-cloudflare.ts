import type { RealtimeEvent } from "./events";
import { redisChannelForConversation } from "./events";
import {
  getExecutionContext,
  getWorkerBindings,
  getWorkerContext,
} from "../runtime/worker-context";
import {
  publishMessageEventMemory,
  subscribeToConversationMemory,
} from "./pubsub-memory";

function readFanoutConfig(): RealtimeFanoutConfig | null {
  const workerCtx = getWorkerContext();
  if (workerCtx?.bindings.REALTIME_FANOUT) {
    const internalSecret =
      workerCtx.vars.CF_REALTIME_INTERNAL_SECRET?.trim() ||
      workerCtx.vars.CF_INTERNAL_SECRET?.trim();
    if (!internalSecret) return null;
    return { service: workerCtx.bindings.REALTIME_FANOUT, internalSecret };
  }

  const baseUrl = process.env.CF_REALTIME_FANOUT_URL?.trim();
  const internalSecret = process.env.CF_REALTIME_INTERNAL_SECRET?.trim();
  if (!baseUrl || !internalSecret) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), internalSecret };
}

type RealtimeFanoutConfig =
  | { baseUrl: string; internalSecret: string; service?: never }
  | { service: Fetcher; internalSecret: string; baseUrl?: never };

let fanoutSubscriberStarted = false;

async function publishToFanout(event: RealtimeEvent): Promise<void> {
  const config = readFanoutConfig();
  if (!config) return;

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.internalSecret}`,
    },
    body: JSON.stringify(event),
  };

  const res = config.service
    ? await config.service.fetch("https://realtime/internal/publish", requestInit)
    : await fetch(`${config.baseUrl}/internal/publish`, requestInit);

  if (!res.ok) {
    console.warn("Cloudflare fanout publish failed:", res.status, await res.text());
  }
}

function ensureFanoutSubscriber(): void {
  if (fanoutSubscriberStarted) return;
  const config = readFanoutConfig();
  if (!config) return;

  fanoutSubscriberStarted = true;
  void connectFanoutSubscriber(config);
}

async function connectFanoutSubscriber(config: RealtimeFanoutConfig): Promise<void> {
  if (config.service) return;
  const baseUrl = config.baseUrl;
  if (!baseUrl) return;

  // Per-conversation ConversationRoom DOs serve WebSocket clients directly at
  // /v1/ws — production uses Durable Objects; in-process pubsub is dev/test only.
  console.warn(
    "CF_REALTIME_FANOUT_URL WebSocket relay is deprecated; use Cloudflare-native /v1/ws clients",
  );
}

export function initCloudflarePubSub(): void {
  ensureFanoutSubscriber();
}

export function subscribeToConversationCloudflare(
  conversationId: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  ensureFanoutSubscriber();
  return subscribeToConversationMemory(conversationId, listener);
}

/** Publish to in-process memory immediately; fanout runs in the background. */
async function publishToUserInbox(userId: string, event: RealtimeEvent): Promise<void> {
  const config = readFanoutConfig();
  if (!config) return;

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.internalSecret}`,
    },
    body: JSON.stringify({ userId, ...event }),
  };

  const res = config.service
    ? await config.service.fetch("https://realtime/internal/publish-user", requestInit)
    : await fetch(`${config.baseUrl}/internal/publish-user`, requestInit);

  if (!res.ok) {
    console.warn("Cloudflare user inbox publish failed:", res.status, await res.text());
  }
}

export function fireAndForgetPublish(event: RealtimeEvent): void {
  publishMessageEventMemory(event);
  const config = readFanoutConfig();
  if (!config) return;

  const execCtx = getExecutionContext();
  if (execCtx) {
    execCtx.waitUntil(publishToFanout(event));
  } else {
    void publishToFanout(event);
  }
}

/** Fan out to each member's UserInbox DO (sidebar / cross-conversation realtime). */
export function fireAndForgetPublishToUsers(userIds: string[], event: RealtimeEvent): void {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const config = readFanoutConfig();
  if (!config) return;

  const publishAll = async () => {
    await Promise.all(unique.map((userId) => publishToUserInbox(userId, event)));
  };

  const execCtx = getExecutionContext();
  if (execCtx) {
    execCtx.waitUntil(publishAll());
  } else {
    void publishAll();
  }
}

export async function publishMessageEventCloudflare(event: RealtimeEvent): Promise<void> {
  fireAndForgetPublish(event);
}

export function isCloudflarePubSubEnabled(): boolean {
  if (getWorkerBindings()?.REALTIME_FANOUT) return true;
  return readFanoutConfig() != null;
}

export { redisChannelForConversation };
