import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  getDirectMessage,
  getOrCreateDirectMessage,
  listDirectMessages,
  searchDmCandidates,
} from "../services/dms";
import { setConversationMuted } from "../services/conversations";

type Env = { Variables: AuthVariables };

export const dmsRouter = new Hono<Env>();

dmsRouter.use("*", requireAuth);

dmsRouter.get("/", async (c) => {
  const session = c.get("session");
  const conversations = await listDirectMessages(session.userId);
  return c.json({ conversations });
});

dmsRouter.get("/people", async (c) => {
  const session = c.get("session");
  const q = c.req.query("q") ?? undefined;
  const people = await searchDmCandidates({
    userId: session.userId,
    organizationId: session.organizationId,
    query: q,
  });
  return c.json({ people });
});

const CreateDmSchema = z.object({
  userId: z.string().uuid(),
});

dmsRouter.post("/", async (c) => {
  const session = c.get("session");
  const body = CreateDmSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await getOrCreateDirectMessage({
    userId: session.userId,
    targetUserId: body.data.userId,
    organizationId: session.organizationId,
  });

  if (!result) {
    return c.json(
      { error: "You can only message people who share a group with you and have joined CCO." },
      403,
    );
  }

  return c.json(result, 201);
});

dmsRouter.get("/:id", async (c) => {
  const session = c.get("session");
  const result = await getDirectMessage({
    conversationId: c.req.param("id"),
    userId: session.userId,
  });
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

const MuteSchema = z.object({ muted: z.boolean() });

dmsRouter.patch("/:id/mute", async (c) => {
  const session = c.get("session");
  const body = MuteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const dm = await getDirectMessage({
    conversationId: c.req.param("id"),
    userId: session.userId,
  });
  if (!dm) return c.json({ error: "Not found" }, 404);

  const ok = await setConversationMuted({
    conversationId: dm.id,
    userId: session.userId,
    muted: body.data.muted,
  });
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ muted: body.data.muted });
});
