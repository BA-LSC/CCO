import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { runWithWorkerContext, type WorkerBindings, type WorkerEnvVars } from "../../../services/api/src/runtime/worker-context";

describe("cco-api worker app", () => {
  test("GET /health returns ok in worker context", async () => {
    const app = createApp();
    const bindings = {} as WorkerBindings;
    const vars: WorkerEnvVars = {
      SESSION_SECRET: "test-secret-must-be-at-least-32-characters-long!!",
      TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901",
      CF_INTERNAL_SECRET: "internal-test-secret",
    };

    const res = await runWithWorkerContext(bindings, vars, () =>
      app.request("/health"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; runtime: string };
    expect(body.ok).toBe(true);
    expect(body.runtime).toBe("cloudflare");
  });
});
