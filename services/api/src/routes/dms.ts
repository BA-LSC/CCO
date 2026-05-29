import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  getDmConversation,
  getOrCreateDirectMessage,
  getOrCreateDmGroup,
  listDirectMessages,
  searchDmCandidates,
  updateDmConversation,
} from "../services/dms";
import { ensureConversationSchemaBestEffort } from "../services/org-schema-capabilities";
import { setConversationMuted } from "../services/conversations";

type Env = { Variables: AuthVariables };

export const dmsRouter = new Hono<Env>();

dmsRouter.use("*", requireAuth);
dmsRouter.use("*", async (_c, next) => {
  await ensureConversationSchemaBestEffort();
  await next();
});

dmsRouter.get("/", async (c) => {
  const session = c.get("session");
  const conversations = await listDirectMessages(session.userId, session.organizationId);
  return c.json({ conversations });
});

dmsRouter.get("/people", async (c) => {
  try {
    const session = c.get("session");
    const q = c.req.query("q") ?? undefined;
    const people = await searchDmCandidates({
      userId: session.userId,
      organizationId: session.organizationId,
      query: q,
    });
    return c.json({ people });
  } catch (err) {
    console.error("GET /dms/people failed:", err);
    return c.json({ error: "Failed to load people" }, 500);
  }
});

const CreateDmSchema = z.union([
  z.object({ userId: z.string().uuid() }),
  z.object({ userIds: z.array(z.string().uuid()).min(2).max(20) }),
]);

dmsRouter.post("/", async (c) => {
  const session = c.get("session");
  const body = CreateDmSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  if ("userIds" in body.data) {
    const result = await getOrCreateDmGroup({
      userId: session.userId,
      memberUserIds: body.data.userIds,
      organizationId: session.organizationId,
    });
    if (!result) {
      return c.json(
        {
          error:
            "You can only create a group with at least two people who share a group or team with you and have joined CCO.",
        },
        403,
      );
    }
    return c.json(result, 201);
  }

  const result = await getOrCreateDirectMessage({
    userId: session.userId,
    targetUserId: body.data.userId,
    organizationId: session.organizationId,
  });

  if (!result) {
    return c.json(
      { error: "You can only message people who share a group or team with you and have joined CCO." },
      403,
    );
  }

  return c.json(result, 201);
});

dmsRouter.get("/:id", async (c) => {
  const session = c.get("session");
  const result = await getDmConversation({
    conversationId: c.req.param("id"),
    userId: session.userId,
    organizationId: session.organizationId,
  });
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

const UpdateDmSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  imageUrl: z.string().url().nullable().optional(),
});

dmsRouter.patch("/:id", async (c) => {
  const session = c.get("session");
  const body = UpdateDmSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  if (body.data.title === undefined && body.data.imageUrl === undefined) {
    return c.json({ error: "No changes provided" }, 400);
  }

  const result = await updateDmConversation({
    conversationId: c.req.param("id"),
    userId: session.userId,
    title: body.data.title,
    imageUrl: body.data.imageUrl,
  });
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

const MuteSchema = z.object({ muted: z.boolean() });

dmsRouter.patch("/:id/mute", async (c) => {
  const session = c.get("session");
  const body = MuteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const dm = await getDmConversation({
    conversationId: c.req.param("id"),
    userId: session.userId,
    organizationId: session.organizationId,
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
