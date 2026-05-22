import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { countUnreadConversations } from "../services/unread";

type Env = { Variables: AuthVariables };

export const unreadRouter = new Hono<Env>();

unreadRouter.use("*", requireAuth);

unreadRouter.get("/summary", async (c) => {
  const session = c.get("session");
  const count = await countUnreadConversations(session.userId);
  return c.json({ count });
});
