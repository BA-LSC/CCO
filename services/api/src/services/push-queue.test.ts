import { afterEach, describe, expect, test } from "bun:test";
import { runWithWorkerContext, type WorkerBindings, type WorkerEnvVars } from "../runtime/worker-context";
import {
  enqueuePushNotification,
  isPushQueueEnabled,
  type PushNotificationJob,
} from "./push-queue";

const job: PushNotificationJob = {
  kind: "message",
  userIds: ["user-1"],
  title: "Test Group",
  body: "Hello",
  url: "/groups/g1/c/c1",
  conversationId: "c1",
};

const vars: WorkerEnvVars = {
  SESSION_SECRET: "test-secret-must-be-at-least-32-characters-long!!",
  TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901",
  CF_INTERNAL_SECRET: "internal-test-secret",
};

describe("isPushQueueEnabled", () => {
  const previous = {
    CF_PUSH_QUEUE_ENABLED: process.env.CF_PUSH_QUEUE_ENABLED,
    CLOUDFLARE_PUSH_QUEUE_ID: process.env.CLOUDFLARE_PUSH_QUEUE_ID,
    CCO_RUNTIME: process.env.CCO_RUNTIME,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("returns true when PUSH_QUEUE binding is present", async () => {
    const bindings = {
      PUSH_QUEUE: { send: async () => {} },
    } as unknown as WorkerBindings;

    await runWithWorkerContext(bindings, vars, () => {
      expect(isPushQueueEnabled()).toBe(true);
    });
  });

  test("defaults on in Cloudflare worker runtime", async () => {
    delete process.env.CF_PUSH_QUEUE_ENABLED;
    delete process.env.CLOUDFLARE_PUSH_QUEUE_ID;

    await runWithWorkerContext({} as WorkerBindings, vars, () => {
      expect(process.env.CF_PUSH_QUEUE_ENABLED).toBe("1");
      expect(isPushQueueEnabled()).toBe(true);
    });
  });

  test("returns false outside Cloudflare when env flags are unset", () => {
    delete process.env.CF_PUSH_QUEUE_ENABLED;
    delete process.env.CLOUDFLARE_PUSH_QUEUE_ID;
    delete process.env.CCO_RUNTIME;
    expect(isPushQueueEnabled()).toBe(false);
  });
});

describe("enqueuePushNotification", () => {
  test("sends job to PUSH_QUEUE binding", async () => {
    const sent: PushNotificationJob[] = [];
    const bindings = {
      PUSH_QUEUE: {
        send: async (payload: PushNotificationJob) => {
          sent.push(payload);
        },
      },
    } as unknown as WorkerBindings;

    const ok = await runWithWorkerContext(bindings, vars, () => enqueuePushNotification(job));
    expect(ok).toBe(true);
    expect(sent).toEqual([job]);
  });
});
