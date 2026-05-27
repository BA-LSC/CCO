import { Hono } from "hono";
import { z } from "zod";
import { reconcileStaleMemberships } from "../jobs/reconcile";
import { runScheduledUpdateCheck } from "../services/org-updates";
import { recordWebhookDelivery } from "../webhooks/delivery";
import {
  handleMembershipDestroyed,
  handleMembershipUpsert,
  handlePersonUpdated,
} from "../webhooks/handlers/membership";
import {
  collectPushTokens,
  collectWebPushSubscriptions,
  sendExpoPushDirect,
  sendWebPushDirect,
} from "../services/push-delivery";
import { verifyCfInternalAuth } from "../runtime/internal-auth";

const internalRouter = new Hono();

function verifyInternalAuth(c: { req: { header: (name: string) => string | undefined } }): boolean {
  return verifyCfInternalAuth(c.req.header("Authorization"));
}

internalRouter.post("/jobs/reconcile", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  const result = await reconcileStaleMemberships();
  return c.json(result);
});

const WebhookForwardSchema = z.object({
  handlerKind: z.enum(["membership_destroyed", "membership_upsert", "person_updated"]),
  payload: z.unknown(),
  deliveryId: z.string().nullable().optional(),
  eventType: z.string().optional(),
});

internalRouter.post("/webhooks/pco", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);

  const parsed = WebhookForwardSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { handlerKind, payload, deliveryId, eventType } = parsed.data;

  if (deliveryId && eventType) {
    const status = await recordWebhookDelivery({ deliveryId, eventType });
    if (status === "duplicate") {
      return c.json({ received: true, duplicate: true });
    }
  }

  try {
    if (handlerKind === "membership_destroyed") {
      await handleMembershipDestroyed(payload as never);
    } else if (handlerKind === "membership_upsert") {
      await handleMembershipUpsert(payload as never);
    } else if (handlerKind === "person_updated") {
      await handlePersonUpdated(payload as never);
    }
  } catch (err) {
    console.error("Internal webhook handler error:", err);
    return c.json({ error: "Handler failed" }, 500);
  }

  return c.json({ received: true });
});

const PushJobSchema = z.object({
  kind: z.enum(["message", "call"]),
  userIds: z.array(z.string()),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  conversationId: z.string(),
  icon: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  callId: z.string().optional(),
});

internalRouter.post("/push/deliver", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);

  const parsed = PushJobSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const job = parsed.data;
  const [expoTokens, webSubscriptions] = await Promise.all([
    collectPushTokens(job.userIds),
    collectWebPushSubscriptions(job.userIds),
  ]);

  await Promise.all([
    sendExpoPushDirect(
      expoTokens,
      job.title,
      job.body,
      job.url,
      job.callId ? { type: "call", callId: job.callId } : undefined,
    ),
    sendWebPushDirect(webSubscriptions, {
      title: job.title,
      body: job.body,
      url: job.url,
      conversationId: job.conversationId,
      icon: job.icon ?? null,
      image: job.image ?? null,
    }),
  ]);

  return c.json({ ok: true });
});

internalRouter.post("/jobs/check-updates", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  const result = await runScheduledUpdateCheck();
  return c.json(result);
});

export { internalRouter };
