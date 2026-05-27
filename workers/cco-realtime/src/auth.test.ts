import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { extractBearerToken, verifyWsToken } from "./auth";

const SESSION_SECRET = "test-secret-must-be-at-least-32-characters-long!!";

async function signTestWsToken(payload: { userId: string; organizationId: string }): Promise<string> {
  return new SignJWT({ ...payload, scope: "ws" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(SESSION_SECRET));
}

describe("realtime auth", () => {
  test("verifyWsToken accepts ws-scoped JWT signed with SESSION_SECRET", async () => {
    const token = await signTestWsToken({ userId: "u1", organizationId: "o1" });
    const payload = await verifyWsToken(token, SESSION_SECRET);
    expect(payload?.userId).toBe("u1");
    expect(payload?.organizationId).toBe("o1");
    expect(payload?.scope).toBe("ws");
  });

  test("verifyWsToken rejects session tokens without ws scope", async () => {
    const token = await new SignJWT({ userId: "u1", organizationId: "o1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(SESSION_SECRET));

    expect(await verifyWsToken(token, SESSION_SECRET)).toBeNull();
  });

  test("extractBearerToken reads query param then Authorization header", () => {
    const url = new URL("https://api.example.com/v1/ws?token=query-token");
    expect(extractBearerToken(new Request(url.toString()), url)).toBe("query-token");

    const headerUrl = new URL("https://api.example.com/v1/ws");
    const req = new Request(headerUrl.toString(), {
      headers: { Authorization: "Bearer header-token" },
    });
    expect(extractBearerToken(req, headerUrl)).toBe("header-token");
  });
});
