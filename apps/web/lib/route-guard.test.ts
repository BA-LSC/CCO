import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  buildReturnPath,
  handleRouteGuard,
  isProtectedPath,
  SESSION_COOKIE_NAME,
} from "./route-guard";

function nextRequest(url: string, cookie?: string) {
  const headers = cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : undefined;
  return new NextRequest(url, { headers });
}

describe("isProtectedPath", () => {
  test("matches chat and settings routes", () => {
    expect(isProtectedPath("/groups")).toBe(true);
    expect(isProtectedPath("/groups/abc/c/general")).toBe(true);
    expect(isProtectedPath("/teams/t1")).toBe(true);
    expect(isProtectedPath("/dms/u1")).toBe(true);
    expect(isProtectedPath("/settings/admin")).toBe(true);
  });

  test("leaves public routes accessible", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/setup")).toBe(false);
    expect(isProtectedPath("/auth/sign-in")).toBe(false);
    expect(isProtectedPath("/auth/sign-in/start")).toBe(false);
    expect(isProtectedPath("/call/join/token123")).toBe(false);
    expect(isProtectedPath("/api/auth/pco/callback")).toBe(false);
  });
});

describe("buildReturnPath", () => {
  test("preserves pathname and search params", () => {
    const req = nextRequest("https://chat.example.com/groups/g1/c/general?tab=members");
    expect(buildReturnPath(req)).toBe("/groups/g1/c/general?tab=members");
  });

  test("rejects open redirects", () => {
    expect(buildReturnPath(nextRequest("https://chat.example.com//evil.example"))).toBe("/groups");
  });
});

describe("handleRouteGuard", () => {
  test("redirects unauthenticated users on protected routes", () => {
    const res = handleRouteGuard(nextRequest("https://chat.example.com/teams/t1?sync=1"));
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe(
      "https://chat.example.com/auth/sign-in?next=%2Fteams%2Ft1%3Fsync%3D1",
    );
  });

  test("allows public routes without a session", () => {
    expect(handleRouteGuard(nextRequest("https://chat.example.com/setup"))).toBeUndefined();
    expect(handleRouteGuard(nextRequest("https://chat.example.com/auth/sign-in"))).toBeUndefined();
  });

  test("passes authenticated protected routes through with return path header", () => {
    const res = handleRouteGuard(nextRequest("https://chat.example.com/dms/u1", "session-token"));
    expect(res?.status).toBe(200);
    expect(res?.headers.get("x-middleware-request-x-return-path")).toBe("/dms/u1");
  });

  test("adds bearer auth for API proxy requests", () => {
    const res = handleRouteGuard(nextRequest("https://chat.example.com/api/v1/session/me", "session-token"));
    expect(res?.headers.get("x-middleware-request-authorization")).toBe("Bearer session-token");
  });
});
