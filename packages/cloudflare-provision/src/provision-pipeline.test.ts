import { describe, expect, test } from "bun:test";
import {
  createInitialProvisionState,
  generateProvisionSecrets,
  PROVISION_STEP_ORDER,
  provisionSessionKey,
  runProvisionPipeline,
  type ProvisionSessionStore,
} from "./provision-pipeline";

function createMemoryStore(): ProvisionSessionStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value) {
      data.set(key, value);
    },
  };
}

describe("generateProvisionSecrets", () => {
  test("generates three unique secrets", () => {
    const secrets = generateProvisionSecrets();
    expect(secrets.SESSION_SECRET.length).toBeGreaterThan(20);
    expect(secrets.TOKEN_ENCRYPTION_KEY.length).toBeGreaterThan(20);
    expect(secrets.CF_INTERNAL_SECRET.length).toBeGreaterThan(20);
    expect(new Set(Object.values(secrets)).size).toBe(3);
  });
});

describe("createInitialProvisionState", () => {
  test("initializes all steps as pending", () => {
    const state = createInitialProvisionState("Grace Church");
    expect(state.churchName).toBe("Grace Church");
    expect(state.currentStep).toBe("verify_token");
    for (const step of PROVISION_STEP_ORDER) {
      expect(state.stepStatus[step].status).toBe("pending");
    }
  });
});

describe("runProvisionPipeline", () => {
  test("persists step progress and completes verify_token", async () => {
    const store = createMemoryStore();
    const sessionId = "sess-1";
    const initial = createInitialProvisionState("Grace Church");
    await store.put(provisionSessionKey(sessionId), JSON.stringify(initial));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, result: { id: "tok", status: "active" } }), {
          status: 200,
        }),
      )) as typeof fetch;

    try {
      const result = await runProvisionPipeline(sessionId, store, {
        apiToken: "cf-token",
      });

      expect(result.stepStatus.verify_token.status).toBe("complete");
      expect(result.secrets).toBeDefined();
      expect(store.data.has(provisionSessionKey(sessionId))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("marks step failed and rethrows on handler error", async () => {
    const store = createMemoryStore();
    const sessionId = "sess-2";
    const initial = createInitialProvisionState("Grace Church");
    await store.put(provisionSessionKey(sessionId), JSON.stringify(initial));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, result: { id: "tok", status: "active" } }), {
          status: 200,
        }),
      )) as typeof fetch;

    try {
      await expect(
        runProvisionPipeline(
          sessionId,
          store,
          { apiToken: "cf-token" },
          {
            create_d1: async () => {
              throw new Error("D1 quota exceeded");
            },
          },
        ),
      ).rejects.toThrow("D1 quota exceeded");

      const persisted = JSON.parse(store.data.get(provisionSessionKey(sessionId)) ?? "{}") as {
        stepStatus: { create_d1: { status: string; error?: string } };
        error?: string;
      };
      expect(persisted.stepStatus.create_d1.status).toBe("failed");
      expect(persisted.stepStatus.create_d1.error).toBe("D1 quota exceeded");
      expect(persisted.error).toBe("D1 quota exceeded");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
