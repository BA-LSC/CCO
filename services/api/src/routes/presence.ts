import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { getUsersOnline, touchUserPresence } from "../services/presence";

type Env = { Variables: AuthVariables };

const MAX_QUERY_IDS = 200;

export const presenceRouter = new Hono<Env>();

presenceRouter.post("/heartbeat", requireAuth, async (c) => {
  const session = c.get("session");
  await touchUserPresence(session.userId);
  return c.json({ ok: true });
});

presenceRouter.post("/query", requireAuth, async (c) => {
  const session = c.get("session");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const rawIds =
    body && typeof body === "object" && Array.isArray((body as { userIds?: unknown }).userIds)
      ? (body as { userIds: unknown[] }).userIds
      : [];

  const userIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (userIds.length > MAX_QUERY_IDS) {
    return c.json({ error: `Too many userIds (max ${MAX_QUERY_IDS})` }, 400);
  }

  if (userIds.length === 0) {
    return c.json({ online: {} });
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.organizationId, session.organizationId)));

  const allowedIds = rows.map((row) => row.id);
  const online = await getUsersOnline(allowedIds);
  return c.json({ online });
});
