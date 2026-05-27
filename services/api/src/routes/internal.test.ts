import { describe, expect, test, afterEach } from "bun:test";
import { verifyCfInternalAuth, getCfInternalSecret } from "../runtime/internal-auth";
import { runWithWorkerContext, type WorkerBindings, type WorkerEnvVars } from "../runtime/worker-context";

describe("verifyCfInternalAuth", () => {
  const previous = process.env.CF_INTERNAL_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.CF_INTERNAL_SECRET;
    else process.env.CF_INTERNAL_SECRET = previous;
  });

  test("rejects missing secret", () => {
    delete process.env.CF_INTERNAL_SECRET;
    expect(verifyCfInternalAuth(undefined)).toBe(false);
    expect(verifyCfInternalAuth("Bearer anything")).toBe(false);
  });

  test("accepts matching bearer token from process.env", () => {
    process.env.CF_INTERNAL_SECRET = "test-internal-secret";
    expect(verifyCfInternalAuth("Bearer test-internal-secret")).toBe(true);
    expect(verifyCfInternalAuth("Bearer wrong")).toBe(false);
  });

  test("prefers worker context secret over process.env", async () => {
    process.env.CF_INTERNAL_SECRET = "env-secret";
    const bindings = {} as WorkerBindings;
    const vars: WorkerEnvVars = {
      SESSION_SECRET: "x".repeat(32),
      TOKEN_ENCRYPTION_KEY: "y".repeat(32),
      CF_INTERNAL_SECRET: "worker-secret",
    };

    await runWithWorkerContext(bindings, vars, async () => {
      expect(getCfInternalSecret()).toBe("worker-secret");
      expect(verifyCfInternalAuth("Bearer worker-secret")).toBe(true);
      expect(verifyCfInternalAuth("Bearer env-secret")).toBe(false);
    });
  });
});

describe("internal routes auth", () => {
  test("POST /internal/jobs/reconcile returns 401 without auth", async () => {
    const previous = process.env.CF_INTERNAL_SECRET;
    delete process.env.CF_INTERNAL_SECRET;

    const { internalRouter } = await import("./internal");
    const res = await internalRouter.request("/jobs/reconcile", { method: "POST" });
    expect(res.status).toBe(401);

    if (previous === undefined) delete process.env.CF_INTERNAL_SECRET;
    else process.env.CF_INTERNAL_SECRET = previous;
  });

  test("POST /internal/push/deliver returns 401 with wrong auth", async () => {
    process.env.CF_INTERNAL_SECRET = "correct-secret";
    const { internalRouter } = await import("./internal");
    const res = await internalRouter.request("/push/deliver", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "message",
        userIds: [],
        title: "t",
        body: "b",
        url: "/",
        conversationId: "c",
      }),
    });
    expect(res.status).toBe(401);
  });
});
