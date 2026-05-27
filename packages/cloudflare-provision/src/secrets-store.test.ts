import { afterEach, describe, expect, test } from "bun:test";
import {
  buildWorkerSecretsStoreBindings,
  CCO_STORE_SECRET,
  ensureSecretsStore,
  hasStoreSecret,
  upsertStoreSecret,
} from "./secrets-store";

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

describe("secrets store client", () => {
  test("ensureSecretsStore reuses existing store by name", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/secrets_store/stores") && init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ id: "store-1", name: "cco" }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: url }] }), {
        status: 404,
      });
    });

    const store = await ensureSecretsStore("acct", "token");
    expect(store).toEqual({ id: "store-1", name: "cco" });
  });

  test("upsertStoreSecret patches existing secret", async () => {
    let patchBody = "";
    mockFetch((url, init) => {
      if (url.endsWith("/secrets") && init?.method !== "POST" && init?.method !== "PATCH") {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ id: "sec-1", name: CCO_STORE_SECRET.SESSION_SECRET, status: "active" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/secrets/sec-1") && init?.method === "PATCH") {
        patchBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ success: true, result: { id: "sec-1" } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: url }] }), {
        status: 404,
      });
    });

    await upsertStoreSecret("acct", "token", "store-1", CCO_STORE_SECRET.SESSION_SECRET, "new-value");
    expect(JSON.parse(patchBody)).toEqual(
      expect.objectContaining({ value: "new-value", scopes: ["workers"] }),
    );
  });

  test("hasStoreSecret returns false when name missing", async () => {
    mockFetch((url) => {
      if (url.endsWith("/secrets")) {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: url }] }), {
        status: 404,
      });
    });

    const found = await hasStoreSecret("acct", "token", "store-1", CCO_STORE_SECRET.GIPHY_API_KEY);
    expect(found).toBe(false);
  });

  test("buildWorkerSecretsStoreBindings maps cco-api org and platform secrets", () => {
    const bindings = buildWorkerSecretsStoreBindings("cco-api", "store-abc");
    expect(bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "secrets_store_secret",
          name: "TOKEN_ENCRYPTION_KEY",
          store_id: "store-abc",
          secret_name: CCO_STORE_SECRET.TOKEN_ENCRYPTION_KEY,
        }),
        expect.objectContaining({
          name: "PCO_CLIENT_SECRET",
          secret_name: CCO_STORE_SECRET.PCO_CLIENT_SECRET,
        }),
      ]),
    );
  });
});
