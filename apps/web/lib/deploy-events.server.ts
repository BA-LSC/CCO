import Redis from "ioredis";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";
import { DEPLOY_SIGNAL_CHANNEL, isDeployDraining, readDeploySignalValue } from "@/lib/deploy-status.server";

export type DeploySignal = {
  updating: boolean;
};

type DeploySignalListener = (signal: DeploySignal) => void;

const listeners = new Set<DeploySignalListener>();

let subscriber: Redis | null = null;

const DEPLOY_POLL_MS = 750;

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

function startApiPollingSubscriber(): void {
  void (async () => {
    let lastUpdating: boolean | null = null;
    const poll = async () => {
      const updating = await isDeployDraining();
      if (lastUpdating === null || updating !== lastUpdating) {
        lastUpdating = updating;
        const signal = { updating };
        for (const listener of listeners) listener(signal);
      }
    };
    await poll();
    setInterval(poll, DEPLOY_POLL_MS);
  })();
}

function ensureDeploySignalSubscriber(): void {
  if (subscriber) return;

  if (isCloudflareDeployTarget() || process.env.CF_DEPLOY_KV === "1" || !process.env.REDIS_URL) {
    startApiPollingSubscriber();
    return;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    startApiPollingSubscriber();
    return;
  }

  subscriber = new Redis(url, {
    connectTimeout: 1000,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  void subscriber.connect().then(() => subscriber?.subscribe(DEPLOY_SIGNAL_CHANNEL)).catch(() => {
    subscriber = null;
    startApiPollingSubscriber();
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

/** Poll-only deploy status for clients that skip SSE (Cloudflare Pages). */
export async function readDeploySignal(): Promise<DeploySignal> {
  if (isCloudflareDeployTarget()) {
    return { updating: await isDeployDraining() };
  }

  const raw = await readDeploySignalValue();
  if (raw != null) return parseDeploySignal(raw);
  return { updating: await isDeployDraining() };
}
