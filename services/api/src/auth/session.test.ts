import { describe, expect, test } from "bun:test";

process.env.SESSION_SECRET ??= "0123456789abcdef0123456789abcdef";

const { signSession, verifySession, signWsToken, verifyWsToken } = await import("./session");

describe("session", () => {
  test("round-trips user id", async () => {
    const token = await signSession({ userId: "u1", organizationId: "o1" });
    const payload = await verifySession(token);
    expect(payload?.userId).toBe("u1");
    expect(payload?.organizationId).toBe("o1");
  });

  test("ws token has ws scope and is not accepted as session", async () => {
    const token = await signWsToken({ userId: "u1", organizationId: "o1" });
    const wsPayload = await verifyWsToken(token);
    expect(wsPayload?.scope).toBe("ws");
    expect(wsPayload?.userId).toBe("u1");
    expect(await verifySession(token)).toBeNull();
  });
});
