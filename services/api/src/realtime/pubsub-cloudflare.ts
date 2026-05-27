import type { RealtimeEvent } from "./events";
import { redisChannelForConversation } from "./events";
import { getWorkerBindings, getWorkerContext } from "../runtime/worker-context";
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
  // /v1/ws. Legacy VPS Bun WebSockets rely on in-process memory pubsub instead.
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

export async function publishMessageEventCloudflare(event: RealtimeEvent): Promise<void> {
  publishMessageEventMemory(event);
  await publishToFanout(event);
}

export function isCloudflarePubSubEnabled(): boolean {
  if (getWorkerBindings()?.REALTIME_FANOUT) return true;
  return readFanoutConfig() != null;
}

export { redisChannelForConversation };
