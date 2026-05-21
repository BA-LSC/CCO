import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { registerPushToken } from "../services/push-notify";

type Env = { Variables: AuthVariables };

const RegisterSchema = z.object({
  expoPushToken: z.string().min(10),
});

export const pushRouter = new Hono<Env>();

pushRouter.use("*", requireAuth);

pushRouter.post("/register", async (c) => {
  const parsed = RegisterSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const session = c.get("session");
  await registerPushToken(session.userId, parsed.data.expoPushToken);
  return c.json({ registered: true });
});
