import { getWorkerBindings, isCloudflareRuntime } from "../runtime/worker-context";
import { getConfiguredOrganization } from "./org-oauth";
import { resolveCloudflareApiToken } from "./org-realtimekit";

export type PushNotificationJob = {
  kind: "message" | "call";
  userIds: string[];
  title: string;
  body: string;
  url: string;
  conversationId: string;
  icon?: string | null;
  image?: string | null;
  callId?: string;
};

async function resolvePushQueueId(): Promise<{ accountId: string; apiToken: string; queueId: string } | null> {
  const org = await getConfiguredOrganization();
  const tokenBundle = await resolveCloudflareApiToken();
  const queueId =
    org?.cloudflarePushQueueId?.trim() || process.env.CLOUDFLARE_PUSH_QUEUE_ID?.trim();
  if (!tokenBundle?.apiToken || !queueId) return null;
  return {
    accountId: tokenBundle.accountId || org?.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || "",
    apiToken: tokenBundle.apiToken,
    queueId,
  };
}

export async function enqueuePushNotification(job: PushNotificationJob): Promise<boolean> {
  const binding = getWorkerBindings()?.PUSH_QUEUE;
  if (binding) {
    try {
      await binding.send(job);
      return true;
    } catch (err) {
      console.warn("Cloudflare Queue binding enqueue failed:", err);
      return false;
    }
  }

  const queue = await resolvePushQueueId();
  if (!queue) return false;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${queue.accountId}/queues/${queue.queueId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${queue.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: job }),
    },
  );

  if (!res.ok) {
    console.warn("Cloudflare Queue enqueue failed:", res.status, await res.text());
    return false;
  }
  return true;
}

export function isPushQueueEnabled(): boolean {
  if (getWorkerBindings()?.PUSH_QUEUE) return true;
  if (isCloudflareRuntime()) return true;
  return (
    process.env.CF_PUSH_QUEUE_ENABLED === "1" ||
    Boolean(process.env.CLOUDFLARE_PUSH_QUEUE_ID?.trim())
  );
}

export async function isPushQueueConfigured(): Promise<boolean> {
  if (isPushQueueEnabled()) return true;
  return Boolean(await resolvePushQueueId());
}
