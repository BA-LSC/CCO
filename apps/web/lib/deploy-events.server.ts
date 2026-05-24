import Redis from "ioredis";
import { DEPLOY_SIGNAL_CHANNEL, isDeployDraining } from "@/lib/deploy-status.server";

export type DeploySignal = {
  updating: boolean;
};

type DeploySignalListener = (signal: DeploySignal) => void;

const listeners = new Set<DeploySignalListener>();

let subscriber: Redis | null = null;

function parseDeploySignal(raw: string): DeploySignal {
  if (raw === "updating") return { updating: true };
  if (raw === "ready") return { updating: false };
  try {
    const parsed = JSON.parse(raw) as { updating?: boolean };
    return { updating: Boolean(parsed.updating) };
  } catch {
    return { updating: raw !== "ready" };
  }
}

function ensureDeploySignalSubscriber(): void {
  if (subscriber) return;
  const url = process.env.REDIS_URL;
  if (!url) return;

  subscriber = new Redis(url, {
    connectTimeout: 1000,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  void subscriber.connect().then(() => subscriber?.subscribe(DEPLOY_SIGNAL_CHANNEL)).catch(() => {
    subscriber = null;
  });

  subscriber.on("message", (_channel, payload) => {
    const signal = parseDeploySignal(payload);
    for (const listener of listeners) {
      listener(signal);
    }
  });
}

export function subscribeDeploySignals(listener: DeploySignalListener): () => void {
  ensureDeploySignalSubscriber();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createDeployEventStream(signal?: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    unsubscribe?.();
    unsubscribe = null;
  };

  return new ReadableStream({
    async start(controller) {
      const send = (payload: DeploySignal) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cleanup();
        }
      };

      send({ updating: await isDeployDraining() });
      unsubscribe = subscribeDeploySignals(send);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25_000);

      signal?.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
}
