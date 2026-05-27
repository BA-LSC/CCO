import { describe, expect, test } from "bun:test";
import { createInitialProvisionState, generateProvisionSecrets } from "./provision-pipeline";
import { createProvisionWorkerHandlers } from "./provision-workers";
import type { CcoWorkerScriptName } from "./worker-definitions";

describe("createProvisionWorkerHandlers", () => {
  test("deploy_workers uploads all six bundles with bindings", async () => {
    const uploads: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/secrets_store/stores") && init?.method !== "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: [{ id: "store-1", name: "cco" }] }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/secrets_store/stores") && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: { id: "store-1", name: "cco" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/secrets_store/stores/") && url.endsWith("/secrets")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }),
        );
      }
      if (/\/workers\/scripts\/[^/]+$/.test(url) && init?.method === "PUT") {
        uploads.push(url.split("/workers/scripts/")[1] ?? "");
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: null }), { status: 200 }),
        );
      }
      if (url.endsWith("/secrets")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: null }), { status: 200 }),
        );
      }
      if (url.endsWith("/schedules")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: null }), { status: 200 }),
        );
      }
      if (url.includes("/queues/") && url.endsWith("/consumers")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: null }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, errors: [{ message: `unexpected ${url}` }] }), {
          status: 404,
        }),
      );
    }) as typeof fetch;

    try {
      const handlers = await createProvisionWorkerHandlers({
        readBundle: async (scriptName: CcoWorkerScriptName) =>
          new TextEncoder().encode(`export default { fetch() { return new Response("${scriptName}") } }`)
            .buffer,
      });

      const state = createInitialProvisionState("Grace Church");
      state.secrets = generateProvisionSecrets();
      state.resources = {
        accountId: "acct-1",
        apiHostname: "api.example.com",
        d1DatabaseId: "d1-id",
        r2BucketName: "cco-uploads-test",
        kvPresenceNamespaceId: "kv-presence",
        kvDeployNamespaceId: "kv-deploy",
        pushQueueId: "queue-id",
      };

      await handlers.deploy_workers?.(state, { apiToken: "cf-token" });

      expect(uploads).toEqual([
        "cco-realtime-fanout",
        "cco-pco-webhook",
        "cco-giphy-proxy",
        "cco-push-consumer",
        "cco-reconcile-cron",
        "cco-api",
      ]);
      expect(state.resources.workerScriptNames).toEqual(uploads);
      expect(state.resources.secretsStoreId).toBe("store-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
