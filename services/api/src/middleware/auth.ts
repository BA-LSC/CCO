import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession, type SessionPayload } from "../auth/session";

export type AuthVariables = {
  session: SessionPayload;
};

export function extractToken(c: Context): string | undefined {
  const cookie = getCookie(c, "connect_session");
  if (cookie) return cookie;
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

export async function tryAuth(c: Context): Promise<SessionPayload | null> {
  const token = extractToken(c);
  if (!token) return null;
  return verifySession(token);
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const token = extractToken(c);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const session = await verifySession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  c.set("session", session);
  await next();
}
