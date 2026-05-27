import { afterEach, describe, expect, test } from "bun:test";
import {
  applyD1MigrationStatements,
  ensureD1Database,
  executeD1Query,
} from "./d1";

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

describe("ensureD1Database", () => {
  test("returns existing database without creating", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/d1/database") && init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ uuid: "db-existing", name: "cco" }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    const result = await ensureD1Database("acct", "token", "cco");
    expect(result).toEqual({ uuid: "db-existing", created: false });
  });

  test("creates database when missing", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/d1/database") && init?.method !== "POST") {
        return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
      }
      if (url.endsWith("/d1/database") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ success: true, result: { uuid: "db-new", name: "cco" } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    const result = await ensureD1Database("acct", "token", "cco");
    expect(result).toEqual({ uuid: "db-new", created: true });
  });
});

describe("executeD1Query", () => {
  test("posts SQL to D1 query endpoint", async () => {
    let capturedBody = "";
    mockFetch((url, init) => {
      if (url.includes("/d1/database/db-1/query")) {
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ success: true, result: [{ success: true }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    await executeD1Query("acct", "token", "db-1", "CREATE TABLE users (id TEXT PRIMARY KEY)");
    expect(JSON.parse(capturedBody)).toEqual({
      sql: "CREATE TABLE users (id TEXT PRIMARY KEY)",
    });
  });
});

describe("applyD1MigrationStatements", () => {
  test("runs each statement sequentially", async () => {
    const queries: string[] = [];
    mockFetch((url, init) => {
      if (url.includes("/query")) {
        const body = JSON.parse(String(init?.body)) as { sql: string };
        queries.push(body.sql);
        return new Response(JSON.stringify({ success: true, result: [{ success: true }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected" }] }), {
        status: 404,
      });
    });

    await applyD1MigrationStatements("acct", "token", "db-1", [
      "CREATE TABLE a (id TEXT);",
      "",
      "CREATE TABLE b (id TEXT);",
    ]);

    expect(queries).toEqual(["CREATE TABLE a (id TEXT);", "CREATE TABLE b (id TEXT);"]);
  });
});
