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

export interface Env {
  PUSH_INTERNAL_URL: string;
  PUSH_INTERNAL_SECRET: string;
}

export default {
  async queue(batch: MessageBatch<PushNotificationJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const res = await fetch(env.PUSH_INTERNAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.PUSH_INTERNAL_SECRET}`,
        },
        body: JSON.stringify(message.body),
      });
      if (!res.ok) {
        console.error("Push delivery failed:", res.status, await res.text());
        message.retry();
        continue;
      }
      message.ack();
    }
  },
};
