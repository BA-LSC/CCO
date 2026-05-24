import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  getUsersPresenceState,
  resolvePresenceVisibleUserIds,
  touchUserPresence,
} from "../services/presence";
import { getUsersStatus } from "../services/user-status";

type Env = { Variables: AuthVariables };

const MAX_QUERY_IDS = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const presenceRouter = new Hono<Env>();

presenceRouter.post("/heartbeat", requireAuth, async (c) => {
  const session = c.get("session");
  let callId: string | null = null;
  try {
    const body = (await c.req.json()) as { callId?: unknown };
    if (typeof body.callId === "string" && UUID_RE.test(body.callId)) {
      callId = body.callId;
    }
  } catch {
    // empty body is fine
  }
  await touchUserPresence(session.userId, callId);
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

  const userIds = [
    ...new Set(
      rawIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
    ),
  ];
  if (userIds.length > MAX_QUERY_IDS) {
    return c.json({ error: `Too many userIds (max ${MAX_QUERY_IDS})` }, 400);
  }

  const online: Record<string, boolean> = {};
  for (const userId of userIds) online[userId] = false;
  if (userIds.length === 0) return c.json({ online });

  const allowedIds = await resolvePresenceVisibleUserIds(
    session.userId,
    session.organizationId,
    userIds,
  );
  const allowedSet = new Set(allowedIds);
  const [presenceState, statuses] = await Promise.all([
    getUsersPresenceState(allowedIds),
    getUsersStatus(allowedIds),
  ]);

  for (const userId of userIds) {
    online[userId] = allowedSet.has(userId) ? (presenceState.online[userId] ?? false) : false;
  }

  const inCall: Record<string, string | null> = {};
  for (const userId of userIds) {
    inCall[userId] = allowedSet.has(userId) ? (presenceState.inCall[userId] ?? null) : null;
  }

  return c.json({ online, inCall, statuses });
});
