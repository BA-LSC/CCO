import { describe, expect, test } from "bun:test";
import { runWithWorkerContext, type WorkerBindings, type WorkerEnvVars } from "../runtime/worker-context";
import { resetPubSubForTests } from "./pubsub";
import { fireAndForgetPublishToUsers } from "./pubsub-cloudflare";

describe("pubsub-cloudflare waitUntil fanout", () => {
  test("publishes to user inbox after request worker context ends", async () => {
    resetPubSubForTests();
    const waitUntilTasks: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil(promise: Promise<unknown>) {
        waitUntilTasks.push(promise);
      },
    };

    const fetchCalls: string[] = [];
    const fanoutService = {
      fetch(input: RequestInfo | URL, _init?: RequestInit) {
        fetchCalls.push(String(input));
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      },
    } as Fetcher;

    const bindings = {
      REALTIME_FANOUT: fanoutService,
    } as WorkerBindings;
    const vars: WorkerEnvVars = {
      SESSION_SECRET: "test-secret-must-be-at-least-32-characters-long!!",
      TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901",
      CF_INTERNAL_SECRET: "internal-test-secret",
    };

    await runWithWorkerContext(
      bindings,
      vars,
      () => {
        fireAndForgetPublishToUsers(["user-2"], {
          type: "typing",
          conversationId: "conv-1",
          userId: "user-1",
          displayName: "Typer",
          isTyping: true,
        });
      },
      executionCtx,
    );

    await Promise.all(waitUntilTasks);
    expect(fetchCalls).toEqual(["https://realtime/internal/publish-user"]);
  });
});
