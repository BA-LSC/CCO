import { afterEach, describe, expect, test } from "bun:test";
import {
  ensureR2AttachmentCacheRule,
  R2_ATTACHMENT_CACHE_RULE_DESCRIPTION,
} from "./cache-rules";

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

describe("ensureR2AttachmentCacheRule", () => {
  test("creates cache ruleset when entrypoint is missing", async () => {
    mockFetch((url, init) => {
      if (url.includes("/rulesets/phases/http_request_cache_settings/entrypoint")) {
        return new Response(
          JSON.stringify({ success: false, errors: [{ message: "not found" }] }),
          { status: 404 },
        );
      }
      if (url.endsWith("/rulesets") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          phase: string;
          rules: Array<{ description: string }>;
        };
        expect(body.phase).toBe("http_request_cache_settings");
        expect(body.rules[0]?.description).toBe(R2_ATTACHMENT_CACHE_RULE_DESCRIPTION);
        return new Response(JSON.stringify({ success: true, result: { id: "rs-new" } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    const result = await ensureR2AttachmentCacheRule("zone-1", "token");
    expect(result).toEqual({ created: true, rulesetId: "rs-new" });
  });

  test("skips when rule already exists", async () => {
    mockFetch((url) => {
      if (url.includes("/entrypoint")) {
        return new Response(JSON.stringify({ success: true, result: { id: "rs-1" } }), {
          status: 200,
        });
      }
      if (url.endsWith("/rulesets/rs-1")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: "rs-1",
              rules: [{ description: R2_ATTACHMENT_CACHE_RULE_DESCRIPTION }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    const result = await ensureR2AttachmentCacheRule("zone-1", "token");
    expect(result).toEqual({ created: false, rulesetId: "rs-1" });
  });
});
