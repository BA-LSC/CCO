import { describe, expect, test } from "bun:test";
import {
  buildWorkerBindings,
  CCO_API_WORKER_ROUTES,
  CCO_RECONCILE_CRON,
  resolveApiRoutePattern,
} from "./worker-definitions";
import { buildWorkerSecretsStoreBindings } from "./secrets-store";

const resources = {
  d1DatabaseId: "d1-id",
  r2BucketName: "cco-uploads-test",
  kvPresenceNamespaceId: "kv-presence",
  kvDeployNamespaceId: "kv-deploy",
  pushQueueId: "queue-id",
};

describe("worker definitions", () => {
  test("maps API routes with catch-all last", () => {
    expect(CCO_API_WORKER_ROUTES.at(-1)).toEqual({
      patternSuffix: "/*",
      script: "cco-api",
    });
    expect(CCO_RECONCILE_CRON).toBe("0 3 * * *");
  });

  test("builds cco-api bindings from provision resources", () => {
    const bindings = buildWorkerBindings("cco-api", {
      resources: { ...resources, chatHostname: "chat.example.com" },
      apiHostname: "api.example.com",
      chatHostname: "chat.example.com",
    });
    expect(bindings).toEqual(
      expect.arrayContaining([
        { type: "d1", name: "DB", id: "d1-id" },
        { type: "service", name: "REALTIME_FANOUT", service: "cco-realtime-fanout" },
        { type: "plain_text", name: "WEB_URL", text: "https://chat.example.com" },
        { type: "plain_text", name: "API_DOMAIN", text: "api.example.com" },
      ]),
    );
    expect(buildWorkerSecretsStoreBindings("cco-api", "store-1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "secrets_store_secret",
          name: "TOKEN_ENCRYPTION_KEY",
          store_id: "store-1",
        }),
      ]),
    );
  });

  test("wires reconcile cron worker internal URL", () => {
    const bindings = buildWorkerBindings("cco-reconcile-cron", {
      resources,
      apiHostname: "api.example.com",
    });
    expect(bindings).toEqual([
      {
        type: "plain_text",
        name: "RECONCILE_INTERNAL_URL",
        text: "https://api.example.com/internal/jobs/reconcile",
      },
    ]);
    expect(buildWorkerSecretsStoreBindings("cco-reconcile-cron", "store-1")).toEqual([
      expect.objectContaining({
        type: "secrets_store_secret",
        name: "RECONCILE_INTERNAL_SECRET",
        store_id: "store-1",
      }),
    ]);
  });

  test("wires push consumer internal URL and queue producer on cco-api", () => {
    const apiBindings = buildWorkerBindings("cco-api", {
      resources,
      apiHostname: "api.example.com",
    });
    expect(apiBindings).toEqual(
      expect.arrayContaining([
        { type: "queue", name: "PUSH_QUEUE", queue_name: "cco-push-notifications" },
      ]),
    );

    const consumerBindings = buildWorkerBindings("cco-push-consumer", {
      resources,
      apiHostname: "api.example.com",
    });
    expect(consumerBindings).toEqual([
      {
        type: "plain_text",
        name: "PUSH_INTERNAL_URL",
        text: "https://api.example.com/internal/push/deliver",
      },
    ]);
    expect(buildWorkerSecretsStoreBindings("cco-push-consumer", "store-1")).toEqual([
      expect.objectContaining({ name: "PUSH_INTERNAL_SECRET" }),
    ]);
  });

  test("resolveApiRoutePattern normalizes hostnames", () => {
    expect(resolveApiRoutePattern("api.example.com", "/v1/ws")).toBe("api.example.com/v1/ws");
    expect(resolveApiRoutePattern("https://api.example.com/", "/*")).toBe("api.example.com/*");
  });
});
