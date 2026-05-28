import {
  normalizeWebhookPayload,
  resolveWebhookEventType,
  resolveWebhookHandler,
  verifyWebhookAuth,
} from "@cco/shared/webhook-auth";

type SecretsStoreSecretBinding = { get(): Promise<string> };

export interface Env {
  WEBHOOK_SECRETS: SecretsStoreSecretBinding | string;
  INTERNAL_FORWARD_URL: string;
  INTERNAL_FORWARD_SECRET: SecretsStoreSecretBinding | string;
}

async function resolveSecret(
  binding: SecretsStoreSecretBinding | string,
): Promise<string> {
  if (typeof binding === "string") return binding;
  return (await binding.get()) ?? "";
}

async function forwardToApi(params: {
  forwardUrl: string;
  forwardSecret: string;
  eventType: string;
  handlerKind: string;
  payload: unknown;
  deliveryId: string | null;
}): Promise<void> {
  const forward = await fetch(params.forwardUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.forwardSecret}`,
      "X-PCO-Webhooks-Name": params.eventType,
    },
    body: JSON.stringify({
      handlerKind: params.handlerKind,
      payload: params.payload,
      deliveryId: params.deliveryId,
      eventType: params.eventType,
    }),
  });

  if (!forward.ok) {
    const detail = await forward.text().catch(() => "");
    console.error(
      `[pco-webhook] Forward failed (${forward.status}):`,
      detail.slice(0, 500),
    );
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const rawBody = await request.text();
    const webhookSecretsRaw = await resolveSecret(env.WEBHOOK_SECRETS);
    const secrets = webhookSecretsRaw.split("\n").map((s) => s.trim()).filter(Boolean);
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
    const forwardSecret = await resolveSecret(env.INTERNAL_FORWARD_SECRET);

    ctx.waitUntil(
      forwardToApi({
        forwardUrl: env.INTERNAL_FORWARD_URL,
        forwardSecret,
        eventType,
        handlerKind,
        payload,
        deliveryId,
      }),
    );

    return Response.json({ accepted: true, queued: true }, { status: 202 });
  },
};
