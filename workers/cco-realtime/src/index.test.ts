import { describe, expect, test } from "bun:test";
import worker from "./worker";

function mockDoNamespace(): DurableObjectNamespace {
  return {
    idFromName: () => ({ toString: () => "do-id" }),
    get: () => ({
      fetch: async () => Response.json({ ok: true, delivered: 0 }),
    }),
  } as unknown as DurableObjectNamespace;
}

describe("cco-realtime worker routes", () => {
  const env = {
    SESSION_SECRET: "test-secret-must-be-at-least-32-characters-long!!",
    CF_INTERNAL_SECRET: "internal-test-secret",
    DB: {} as D1Database,
    CONVERSATION_ROOM: mockDoNamespace(),
    USER_INBOX: mockDoNamespace(),
  };

  test("GET /health returns ok", async () => {
    const res = await worker.fetch(new Request("https://realtime/health"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("POST /internal/publish requires internal secret", async () => {
    const res = await worker.fetch(
      new Request("https://realtime/internal/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message.created", conversationId: "c1" }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("POST /internal/publish forwards to conversation DO", async () => {
    let forwardedPath = "";
    const stubEnv = {
      ...env,
      CONVERSATION_ROOM: {
        idFromName: (name: string) => ({ toString: () => `do:${name}` }),
        get: () => ({
          fetch: async (req: Request) => {
            forwardedPath = new URL(req.url).pathname;
            return Response.json({ ok: true, delivered: 2 });
          },
        }),
      } as unknown as DurableObjectNamespace,
      USER_INBOX: mockDoNamespace(),
    };

    const res = await worker.fetch(
      new Request("https://realtime/internal/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer internal-test-secret",
        },
        body: JSON.stringify({
          type: "message.created",
          conversationId: "conv-abc",
          message: { id: "m1" },
        }),
      }),
      stubEnv,
    );

    expect(res.status).toBe(200);
    expect(forwardedPath).toBe("/internal/publish");
    const body = (await res.json()) as { delivered: number };
    expect(body.delivered).toBe(2);
  });

  test("GET /v1/ws without token returns 401", async () => {
    const res = await worker.fetch(
      new Request("https://realtime/v1/ws?conversationId=conv-1"),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("GET /v1/ws without conversationId returns 400 after auth", async () => {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ userId: "u1", organizationId: "o1", scope: "ws" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(env.SESSION_SECRET));

    const res = await worker.fetch(
      new Request(`https://realtime/v1/ws?token=${encodeURIComponent(token)}`),
      env,
    );
    expect(res.status).toBe(400);
  });
});
