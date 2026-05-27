import { afterEach, describe, expect, test } from "bun:test";
import {
  deployAllProvisionWorkers,
  deployWorkerScript,
  ensureCcoApiWorkerRoutes,
  ensureQueueConsumer,
} from "./workers-deploy";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("deployWorkerScript", () => {
  test("uploads multipart worker bundle", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedForm: FormData | undefined;

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      capturedForm = init?.body as FormData;
      return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
    });

    const moduleBytes = new TextEncoder().encode("export default { fetch() {} }").buffer;
    await deployWorkerScript("acct-1", "cf-token", "cco-api", moduleBytes, [
      { type: "plain_text", name: "UPLOAD_STORAGE", text: "r2" },
    ]);

    expect(capturedUrl).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-1/workers/scripts/cco-api",
    );
    expect(capturedMethod).toBe("PUT");
    expect(capturedAuth).toBe("Bearer cf-token");
    expect(capturedForm).toBeInstanceOf(FormData);

    const metadata = JSON.parse(String(capturedForm?.get("metadata"))) as {
      main_module: string;
      bindings: Array<{ name: string }>;
    };
    expect(metadata.main_module).toBe("cco-api.mjs");
    expect(metadata.bindings[0]?.name).toBe("UPLOAD_STORAGE");
  });
});

describe("ensureQueueConsumer", () => {
  test("binds worker consumer with max_retries 3", async () => {
    let capturedBody = "";
    mockFetch((url, init) => {
      if (url.endsWith("/consumers")) {
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: url }] }), {
        status: 404,
      });
    });

    await ensureQueueConsumer("acct-1", "cf-token", "queue-id", "cco-push-consumer");
    expect(JSON.parse(capturedBody)).toEqual({
      type: "worker",
      script_name: "cco-push-consumer",
      settings: {
        batch_size: 10,
        max_wait_time_ms: 5000,
        max_retries: 3,
      },
    });
  });
});

describe("deployAllProvisionWorkers", () => {
  test("deploys all scripts with store bindings, cron, and queue consumer (no secret PUTs)", async () => {
    const uploadedScripts: string[] = [];
    let secretPutCount = 0;
    let cronConfigured = false;
    let queueConsumerConfigured = false;

    mockFetch((url, init) => {
      if (url.includes("/workers/scripts/") && url.endsWith("/secrets")) {
        secretPutCount += 1;
        return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
      }
      if (
        url.includes("/workers/scripts/") &&
        !url.endsWith("/secrets") &&
        !url.endsWith("/schedules")
      ) {
        uploadedScripts.push(url.split("/workers/scripts/")[1] ?? "");
        return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
      }
      if (url.endsWith("/schedules")) {
        cronConfigured = true;
        return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
      }
      if (url.includes("/queues/") && url.endsWith("/consumers")) {
        queueConsumerConfigured = true;
        return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: url }] }), {
        status: 404,
      });
    });

    const deployed = await deployAllProvisionWorkers({
      accountId: "acct-1",
      apiToken: "cf-token",
      apiHostname: "api.example.com",
      secretsStoreId: "store-1",
      resources: {
        d1DatabaseId: "d1-id",
        r2BucketName: "cco-uploads-test",
        kvPresenceNamespaceId: "kv-presence",
        kvDeployNamespaceId: "kv-deploy",
        pushQueueId: "queue-id",
      },
      readBundle: async () => new TextEncoder().encode("export default {}").buffer,
    });

    expect(deployed).toHaveLength(6);
    expect(uploadedScripts).toContain("cco-reconcile-cron");
    expect(cronConfigured).toBe(true);
    expect(queueConsumerConfigured).toBe(true);
    expect(secretPutCount).toBe(0);
  });
});

describe("ensureCcoApiWorkerRoutes", () => {
  test("creates specific routes before catch-all", async () => {
    const patterns: string[] = [];
    mockFetch((url, init) => {
      if (url.includes("/workers/routes") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { pattern: string };
        patterns.push(body.pattern);
        return new Response(
          JSON.stringify({ success: true, result: { id: "route-id", pattern: body.pattern, script: "x" } }),
          { status: 200 },
        );
      }
      if (url.includes("/workers/routes") && !init?.method) {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: url }] }), { status: 404 });
    });

    await ensureCcoApiWorkerRoutes("zone-1", "cf-token", "api.example.com");
    expect(patterns).toEqual([
      "api.example.com/webhooks/pco",
      "api.example.com/v1/ws",
      "api.example.com/*",
    ]);
  });
});
