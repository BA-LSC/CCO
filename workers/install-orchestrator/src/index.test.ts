import { describe, expect, test } from "bun:test";
import { createInstallApp, type InstallOrchestratorEnv } from "./app";

function createMemoryKv(): KVNamespace {
  const data = new Map<string, string>();
  return {
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => {
      data.set(key, value);
    },
    delete: async (key: string) => {
      data.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async (key: string) => ({
      value: data.get(key) ?? null,
      metadata: null,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

function testEnv(kv: KVNamespace): InstallOrchestratorEnv {
  return {
    INSTALL_SESSIONS: kv,
    CCO_INSTALL_ORIGIN: "http://localhost:3002",
    TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901",
  };
}

describe("install orchestrator routes", () => {
  test("GET /health returns ok", async () => {
    const app = createInstallApp();
    const res = await app.request("/health", {}, { INSTALL_SESSIONS: createMemoryKv(), CCO_INSTALL_ORIGIN: "http://localhost:3002", TOKEN_ENCRYPTION_KEY: "01234567890123456789012345678901" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("POST /api/session requires churchName", async () => {
    const app = createInstallApp();
    const env = testEnv(createMemoryKv());
    const res = await app.request(
      "/api/session",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("POST /api/session creates session", async () => {
    const app = createInstallApp();
    const env = testEnv(createMemoryKv());
    const res = await app.request(
      "/api/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchName: "Grace Church" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; step: string };
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.step).toBe("welcome");
  });

  test("POST /api/cloudflare/verify requires session header", async () => {
    const app = createInstallApp();
    const env = testEnv(createMemoryKv());
    const res = await app.request(
      "/api/cloudflare/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken: "token" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/cloudflare/verify validates token via Cloudflare API", async () => {
    const app = createInstallApp();
    const env = testEnv(createMemoryKv());
    const sessionRes = await app.request(
      "/api/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchName: "Grace Church" }),
      },
      env,
    );
    const { sessionId } = (await sessionRes.json()) as { sessionId: string };

    const originalFetch = globalThis.fetch;

    let call = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      call += 1;
      const url = String(input);
      if (url.includes("/user/tokens/verify")) {
        return new Response(
          JSON.stringify({ success: true, result: { id: "tok", status: "active" } }),
          { status: 200 },
        );
      }
      if (url.includes("/accounts/acc-1/workers/scripts")) {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      if (url.includes("/accounts/acc-1/r2/buckets")) {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      if (url.includes("/accounts/acc-1/secrets_store/stores")) {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      if (url.includes("/accounts") && !url.includes("/accounts/acc-1/")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ id: "acc-1", name: "Test Account" }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 400,
      });
    }) as unknown as typeof fetch;

    try {
      const res = await app.request(
        "/api/cloudflare/verify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-install-session": sessionId,
          },
          body: JSON.stringify({ apiToken: "cf-test-token" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; accountId: string };
      expect(body.ok).toBe(true);
      expect(body.accountId).toBe("acc-1");
      expect(call).toBeGreaterThanOrEqual(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("GET /api/provision/status returns 404 before start", async () => {
    const app = createInstallApp();
    const env = testEnv(createMemoryKv());
    const sessionRes = await app.request(
      "/api/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchName: "Grace Church" }),
      },
      env,
    );
    const { sessionId } = (await sessionRes.json()) as { sessionId: string };

    const res = await app.request(
      "/api/provision/status",
      { method: "GET", headers: { "x-install-session": sessionId } },
      env,
    );
    expect(res.status).toBe(404);
  });

  test("POST /api/provision/start requires domain selection", async () => {
    const app = createInstallApp();
    const env = testEnv(createMemoryKv());
    const sessionRes = await app.request(
      "/api/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchName: "Grace Church" }),
      },
      env,
    );
    const { sessionId } = (await sessionRes.json()) as { sessionId: string };

    const res = await app.request(
      "/api/provision/start",
      { method: "POST", headers: { "x-install-session": sessionId } },
      env,
    );
    expect(res.status).toBe(400);
  });
});
