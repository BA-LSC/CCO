import { describe, expect, test } from "bun:test";
import { runWithWorkerContext, type WorkerBindings, type WorkerEnvVars } from "../runtime/worker-context";
import {
  configurePubSub,
  getPubSubBackendForTests,
  publishMessageEvent,
  resetPubSubForTests,
  subscribeToConversation,
} from "./pubsub";

function withoutRedisUrl<T>(fn: () => T | Promise<T>): Promise<T> {
  const savedRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (savedRedisUrl !== undefined) {
        process.env.REDIS_URL = savedRedisUrl;
      } else {
        delete process.env.REDIS_URL;
      }
      resetPubSubForTests();
    });
}

describe("configurePubSub", () => {
  test("selects cloudflare backend once worker bindings are active", async () => {
    await withoutRedisUrl(async () => {
      resetPubSubForTests();
      configurePubSub();
      expect(getPubSubBackendForTests()).toBe("memory");

      const bindings = {
        REALTIME_FANOUT: {} as Fetcher,
      } as WorkerBindings;
      const vars: WorkerEnvVars = {
        SESSION_SECRET: "test-secret-must-be-at-least-32-characters-long!!",
        TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901",
        CF_INTERNAL_SECRET: "internal-test-secret",
      };

      await runWithWorkerContext(bindings, vars, () => {
        configurePubSub();
        expect(getPubSubBackendForTests()).toBe("cloudflare");
      });
    });
  });
});

describe("publishMessageEvent", () => {
  test("emits message.created to subscribers", async () => {
    await withoutRedisUrl(async () => {
      resetPubSubForTests();
      const received: string[] = [];
      subscribeToConversation("c1", (event) => {
        received.push(event.type);
      });

      await publishMessageEvent({
        type: "message.created",
        conversationId: "c1",
        message: {
          id: "m1",
          conversationId: "c1",
          authorId: "u1",
          authorName: "Test",
          body: "hi",
          attachmentUrl: null,
          messageType: "text",
          clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
          editedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
        },
      });

      expect(received).toEqual(["message.created"]);
    });
  });
});
