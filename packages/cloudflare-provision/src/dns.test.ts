import { afterEach, describe, expect, test } from "bun:test";
import { ensureDnsRecord } from "./dns";

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

describe("ensureDnsRecord", () => {
  test("creates DNS record when missing", async () => {
    mockFetch((url, init) => {
      if (url.includes("/dns_records") && !init?.method) {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      if (url.includes("/dns_records") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: "rec-1",
              type: "CNAME",
              name: "chat.example.com",
              content: "pages.example.com",
              proxied: true,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    const result = await ensureDnsRecord("zone-1", "token", {
      type: "CNAME",
      name: "chat.example.com",
      content: "pages.example.com",
      proxied: true,
    });

    expect(result).toEqual({ id: "rec-1", created: true });
  });

  test("returns existing record without creating", async () => {
    mockFetch((url) => {
      if (url.includes("/dns_records")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "rec-existing",
                type: "CNAME",
                name: "api.example.com",
                content: "cco-api.workers.dev",
                proxied: true,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    const result = await ensureDnsRecord("zone-1", "token", {
      type: "CNAME",
      name: "api.example.com",
      content: "cco-api.workers.dev",
      proxied: true,
    });

    expect(result).toEqual({ id: "rec-existing", created: false });
  });
});
