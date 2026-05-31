import { describe, expect, test } from "bun:test";
import {
  getWorkerBindings,
  runWithWorkerContext,
  scheduleBackgroundWork,
  type WorkerBindings,
  type WorkerEnvVars,
} from "./worker-context";
import { configurePubSub, getPubSubBackendForTests, resetPubSubForTests } from "../realtime/pubsub";

describe("scheduleBackgroundWork", () => {
  test("restores worker bindings inside waitUntil after the request scope ends", async () => {
    resetPubSubForTests();
    const waitUntilTasks: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil(promise: Promise<unknown>) {
        waitUntilTasks.push(promise);
      },
    };

    const bindings = {
      REALTIME_FANOUT: {} as Fetcher,
    } as WorkerBindings;
    const vars: WorkerEnvVars = {
      SESSION_SECRET: "test-secret-must-be-at-least-32-characters-long!!",
      TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901",
      CF_INTERNAL_SECRET: "internal-test-secret",
    };

    let backendDuringBackground: string | null = null;

    await runWithWorkerContext(
      bindings,
      vars,
      () => {
        scheduleBackgroundWork(() => {
          configurePubSub();
          backendDuringBackground = getPubSubBackendForTests();
          expect(getWorkerBindings()?.REALTIME_FANOUT).toBeDefined();
        });
      },
      executionCtx,
    );

    expect(getWorkerBindings()).toBeUndefined();
    await Promise.all(waitUntilTasks);
    expect(backendDuringBackground).toBe("cloudflare");
  });
});
