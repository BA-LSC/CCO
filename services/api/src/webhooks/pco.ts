import { Hono } from "hono";
import { getOrgWebhookSecrets } from "../services/org-config";
import { recordWebhookDelivery } from "./delivery";
import {
  normalizeWebhookPayload,
  resolveWebhookHandler,
  resolveWebhookEventType,
  verifyWebhookAuth,
} from "./auth";
import {
  handleMembershipDestroyed,
  handleMembershipUpsert,
  handlePersonUpdated,
} from "./handlers/membership";

export const webhooksRouter = new Hono();

webhooksRouter.post("/pco", async (c) => {
  const rawBody = await c.req.text();
  const secrets = await getOrgWebhookSecrets();
  const auth = verifyWebhookAuth({
    secrets,
    rawBody,
    authenticityHeader: c.req.header("X-PCO-Webhooks-Authenticity"),
  });

  if (!auth.ok) {
    const message =
      auth.reason === "secret_unset" ? "Webhook secret not configured" : "Invalid webhook authenticity";
    return c.json({ error: message }, 401);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const eventType = resolveWebhookEventType({
    nameHeader: c.req.header("X-PCO-Webhooks-Name"),
    legacyEventTypeHeader: c.req.header("X-PCO-Webhooks-Event-Type"),
    rawPayload,
  });
  if (!eventType) {
    return c.json({ error: "Missing webhook event type" }, 400);
  }

  const handlerKind = resolveWebhookHandler(eventType);
  if (!handlerKind) {
    return c.json({ received: true, ignored: true });
  }

  const { deliveryId, body: payload } = normalizeWebhookPayload(rawPayload);
  if (deliveryId) {
    const status = await recordWebhookDelivery({ deliveryId, eventType });
    if (status === "duplicate") {
      return c.json({ received: true, duplicate: true });
    }
  }

  try {
    if (handlerKind === "membership_destroyed") {
      await handleMembershipDestroyed(payload);
    } else if (handlerKind === "membership_upsert") {
      await handleMembershipUpsert(payload);
    } else if (handlerKind === "person_updated") {
      await handlePersonUpdated(payload);
    }
  } catch (err) {
    console.error("Webhook handler error:", eventType, err);
    return c.json({ error: "Handler failed" }, 500);
  }

  return c.json({ received: true });
});
