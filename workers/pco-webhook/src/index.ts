import {
  normalizeWebhookPayload,
  resolveWebhookEventType,
  resolveWebhookHandler,
  verifyWebhookAuth,
} from "@cco/shared/webhook-auth";

export interface Env {
  WEBHOOK_SECRETS: string;
  INTERNAL_FORWARD_URL: string;
  INTERNAL_FORWARD_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const rawBody = await request.text();
    const secrets = env.WEBHOOK_SECRETS.split("\n").map((s) => s.trim()).filter(Boolean);
    const auth = await verifyWebhookAuth({
      secrets,
      rawBody,
      authenticityHeader: request.headers.get("X-PCO-Webhooks-Authenticity") ?? undefined,
      allowWithoutSecret: false,
    });

    if (!auth.ok) {
      const message =
        auth.reason === "secret_unset" ? "Webhook secret not configured" : "Invalid webhook authenticity";
      return Response.json({ error: message }, { status: 401 });
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const eventType = resolveWebhookEventType({
      nameHeader: request.headers.get("X-PCO-Webhooks-Name") ?? undefined,
      legacyEventTypeHeader: request.headers.get("X-PCO-Webhooks-Event-Type") ?? undefined,
      rawPayload,
    });
    if (!eventType) {
      return Response.json({ error: "Missing webhook event type" }, { status: 400 });
    }

    const handlerKind = resolveWebhookHandler(eventType);
    if (!handlerKind) {
      return Response.json({ received: true, ignored: true });
    }

    const { deliveryId, body: payload } = normalizeWebhookPayload(rawPayload);

    const forward = await fetch(env.INTERNAL_FORWARD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.INTERNAL_FORWARD_SECRET}`,
        "X-PCO-Webhooks-Name": eventType,
      },
      body: JSON.stringify({ handlerKind, payload, deliveryId, eventType }),
    });

    if (!forward.ok) {
      return Response.json({ error: "Handler failed" }, { status: 500 });
    }

    const result = await forward.json();
    return Response.json(result);
  },
};
