import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  getVapidPublicKey,
  registerPushToken,
  registerWebPushSubscription,
  unregisterWebPushSubscription,
} from "../services/push-notify";

type Env = { Variables: AuthVariables };

const RegisterSchema = z.object({
  expoPushToken: z.string().min(10),
});

const WebSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const WebUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const pushRouter = new Hono<Env>();

pushRouter.use("*", requireAuth);

pushRouter.get("/vapid-public-key", (c) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) return c.json({ error: "Web push is not configured" }, 503);
  return c.json({ publicKey });
});

pushRouter.post("/register", async (c) => {
  const parsed = RegisterSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const session = c.get("session");
  await registerPushToken(session.userId, parsed.data.expoPushToken);
  return c.json({ registered: true });
});

pushRouter.post("/web/subscribe", async (c) => {
  const parsed = WebSubscribeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const session = c.get("session");
  await registerWebPushSubscription(session.userId, {
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: c.req.header("user-agent"),
  });
  return c.json({ subscribed: true });
});

pushRouter.post("/web/unsubscribe", async (c) => {
  const parsed = WebUnsubscribeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const session = c.get("session");
  await unregisterWebPushSubscription(session.userId, parsed.data.endpoint);
  return c.json({ unsubscribed: true });
});
