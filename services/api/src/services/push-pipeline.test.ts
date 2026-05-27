import { afterEach, describe, expect, mock, test } from "bun:test";
import pushConsumer from "../../../../workers/push-consumer/src/index.ts";

const job = {
  kind: "message" as const,
  userIds: ["user-1"],
  title: "Test Group",
  body: "Hello world",
  url: "/groups/g1/c/c1",
  conversationId: "conv-1",
};

describe("push notification pipeline", () => {
  const originalFetch = globalThis.fetch;
  let deliverCalls: Array<{ url: string; body: unknown; auth: string | null }>;
  let webPushDeliveries: unknown[];

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("message job flows queue consumer to internal deliver and web push mock", async () => {
    deliverCalls = [];
    webPushDeliveries = [];

    mock.module("./push-delivery", () => ({
      collectPushTokens: async () => [],
      collectWebPushSubscriptions: async () => [
        {
          endpoint: "https://push.example/endpoint",
          keys: { p256dh: "p256dh", auth: "auth" },
        },
      ],
      sendExpoPushDirect: async () => {},
      sendWebPushDirect: async (
        subscriptions: unknown[],
        payload: unknown,
      ) => {
        webPushDeliveries.push({ subscriptions, payload });
      },
    }));

    process.env.CF_INTERNAL_SECRET = "pipeline-secret";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/internal/push/deliver")) {
        deliverCalls.push({
          url,
          body: JSON.parse(String(init?.body ?? "{}")),
          auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
        });

        const { internalRouter } = await import("../routes/internal");
        return internalRouter.request("/push/deliver", {
          method: "POST",
          headers: {
            Authorization: String(init?.headers && (init.headers as Record<string, string>).Authorization),
            "Content-Type": "application/json",
          },
          body: String(init?.body ?? ""),
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const ack = mock(() => {});
    const retry = mock(() => {});

    await pushConsumer.queue(
      {
        messages: [
          {
            body: job,
            ack,
            retry,
          },
        ],
      } as never,
      {
        PUSH_INTERNAL_URL: "https://api.example.com/internal/push/deliver",
        PUSH_INTERNAL_SECRET: "pipeline-secret",
      },
    );

    expect(deliverCalls).toHaveLength(1);
    expect(deliverCalls[0]?.auth).toBe("Bearer pipeline-secret");
    expect(deliverCalls[0]?.body).toEqual(job);
    expect(webPushDeliveries).toHaveLength(1);
    expect(webPushDeliveries[0]).toEqual({
      subscriptions: [
        {
          endpoint: "https://push.example/endpoint",
          keys: { p256dh: "p256dh", auth: "auth" },
        },
      ],
      payload: {
        title: job.title,
        body: job.body,
        url: job.url,
        conversationId: job.conversationId,
        icon: null,
        image: null,
      },
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  test("queue consumer retries when deliver endpoint fails", async () => {
    globalThis.fetch = (async () =>
      new Response("upstream error", { status: 502 })) as typeof fetch;

    const ack = mock(() => {});
    const retry = mock(() => {});

    await pushConsumer.queue(
      {
        messages: [
          {
            body: job,
            ack,
            retry,
          },
        ],
      } as never,
      {
        PUSH_INTERNAL_URL: "https://api.example.com/internal/push/deliver",
        PUSH_INTERNAL_SECRET: "pipeline-secret",
      },
    );

    expect(retry).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
  });
});
