import { createHmac, timingSafeEqual } from "node:crypto";

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

export function allowUnauthWebhooks(): boolean {
  return !isProductionEnv() && process.env.ALLOW_UNAUTH_WEBHOOKS === "true";
}

/** Fail closed in production when webhook secret is unset. */
export function shouldAcceptWebhookWithoutSecret(): boolean {
  return allowUnauthWebhooks();
}

export function verifyHmacAuthenticity(
  secret: string,
  rawBody: string,
  authenticityHeader: string | undefined,
): boolean {
  if (!authenticityHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(authenticityHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type WebhookAuthResult =
  | { ok: true; secret: string | null; skipHmac: boolean }
  | { ok: false; reason: "secret_unset" | "invalid_hmac" };

export function verifyWebhookAuth(params: {
  secrets: string[];
  rawBody: string;
  authenticityHeader: string | undefined;
}): WebhookAuthResult {
  if (params.secrets.length === 0) {
    if (shouldAcceptWebhookWithoutSecret()) {
      return { ok: true, secret: null, skipHmac: true };
    }
    return { ok: false, reason: "secret_unset" };
  }

  for (const secret of params.secrets) {
    if (verifyHmacAuthenticity(secret, params.rawBody, params.authenticityHeader)) {
      return { ok: true, secret, skipHmac: false };
    }
  }

  return { ok: false, reason: "invalid_hmac" };
}

export const WEBHOOK_EVENT_TYPES = {
  MEMBERSHIP_DESTROYED: "groups.v2.events.membership.destroyed",
  MEMBERSHIP_CREATED: "groups.v2.events.membership.created",
  MEMBERSHIP_UPDATED: "groups.v2.events.membership.updated",
  PERSON_UPDATED: "people.v2.events.person.updated",
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[keyof typeof WEBHOOK_EVENT_TYPES];

export type WebhookHandlerKind =
  | "membership_destroyed"
  | "membership_upsert"
  | "person_updated";

type EventDeliveryRow = {
  attributes?: { name?: string };
};

/** PCO sends the event name in X-PCO-Webhooks-Name; fall back to body wrapper. */
export function resolveWebhookEventType(params: {
  nameHeader: string | undefined;
  legacyEventTypeHeader: string | undefined;
  rawPayload: unknown;
}): string | null {
  const fromHeader = params.nameHeader?.trim() || params.legacyEventTypeHeader?.trim();
  if (fromHeader) return fromHeader;

  if (!params.rawPayload || typeof params.rawPayload !== "object") {
    return null;
  }

  const data = (params.rawPayload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const delivery = data[0] as EventDeliveryRow | undefined;
  const name = delivery?.attributes?.name?.trim();
  return name || null;
}

export function resolveWebhookHandler(eventType: string): WebhookHandlerKind | null {
  switch (eventType) {
    case WEBHOOK_EVENT_TYPES.MEMBERSHIP_DESTROYED:
      return "membership_destroyed";
    case WEBHOOK_EVENT_TYPES.MEMBERSHIP_CREATED:
    case WEBHOOK_EVENT_TYPES.MEMBERSHIP_UPDATED:
      return "membership_upsert";
    case WEBHOOK_EVENT_TYPES.PERSON_UPDATED:
      return "person_updated";
    default:
      return null;
  }
}

type EventDeliveryPayloadRow = {
  id?: string;
  type?: string;
  attributes?: { payload?: string };
};

export type NormalizedWebhookPayload = {
  deliveryId: string | null;
  body: unknown;
};

export function normalizeWebhookPayload(raw: unknown): NormalizedWebhookPayload {
  if (!raw || typeof raw !== "object") {
    return { deliveryId: null, body: raw };
  }

  const outer = raw as Record<string, unknown>;
  const meta = outer.meta as { delivery_id?: string } | undefined;
  if (typeof meta?.delivery_id === "string" && meta.delivery_id.length > 0) {
    return { deliveryId: meta.delivery_id, body: raw };
  }

  const data = outer.data;
  if (Array.isArray(data)) {
    const delivery = data[0] as EventDeliveryPayloadRow | undefined;
    if (delivery?.type === "EventDelivery") {
      const innerJson = delivery.attributes?.payload;
      if (typeof innerJson === "string") {
        let inner: unknown = raw;
        try {
          inner = JSON.parse(innerJson);
        } catch {
          inner = raw;
        }
        const innerMeta = (inner as { meta?: { delivery_id?: string } } | undefined)?.meta;
        const deliveryId =
          (typeof innerMeta?.delivery_id === "string" && innerMeta.delivery_id) ||
          (typeof delivery.id === "string" ? delivery.id : null);
        return { deliveryId, body: inner };
      }
      if (typeof delivery.id === "string") {
        return { deliveryId: delivery.id, body: raw };
      }
    }
  }

  return { deliveryId: null, body: raw };
}

export function computeWebhookAuthenticity(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}
