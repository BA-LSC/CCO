import { Hono } from "hono";
import { MessageCreateSchema } from "@cco/shared";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createMessage, deleteMessage, updateMessage } from "../services/messages";
import { addReaction, listReactionsForMessage, removeReaction } from "../services/reactions";

type Env = { Variables: AuthVariables };

export const messagesRouter = new Hono<Env>();

messagesRouter.use("*", requireAuth);

messagesRouter.post("/", async (c) => {
  const session = c.get("session");
  const conversationId = c.req.query("conversationId");
  if (!conversationId) return c.json({ error: "conversationId required" }, 400);

  const body = MessageCreateSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await createMessage({
    conversationId,
    userId: session.userId,
    body: body.data.body,
    clientMessageId: body.data.clientMessageId,
    attachmentUrl: body.data.attachmentUrl,
    messageType: body.data.messageType,
  });

  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ message: result.message }, 201);
});

const UpdateSchema = z.object({ body: z.string().min(1).max(10000) });

messagesRouter.patch("/:id", async (c) => {
  const session = c.get("session");
  const parsed = UpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const result = await updateMessage({
    messageId: c.req.param("id"),
    userId: session.userId,
    body: parsed.data.body,
  });

  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ message: result.message });
});

const ReactionSchema = z.object({ emoji: z.string().min(1).max(16) });

messagesRouter.get("/:id/reactions", async (c) => {
  const session = c.get("session");
  const reactions = await listReactionsForMessage(c.req.param("id"), session.userId);
  if (!reactions) return c.json({ error: "Forbidden" }, 403);
  return c.json({ reactions });
});

messagesRouter.post("/:id/reactions", async (c) => {
  const session = c.get("session");
  const body = ReactionSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await addReaction({
    messageId: c.req.param("id"),
    userId: session.userId,
    emoji: body.data.emoji,
  });
  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ reaction: result.reaction }, 201);
});

messagesRouter.delete("/:id/reactions", async (c) => {
  const session = c.get("session");
  const emoji = c.req.query("emoji");
  if (!emoji) return c.json({ error: "emoji required" }, 400);

  const result = await removeReaction({
    messageId: c.req.param("id"),
    userId: session.userId,
    emoji,
  });
  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true });
});

messagesRouter.delete("/:id", async (c) => {
  const session = c.get("session");
  const result = await deleteMessage({
    messageId: c.req.param("id"),
    userId: session.userId,
  });

  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true });
});
