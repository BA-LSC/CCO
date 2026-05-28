export const WEBHOOK_EVENT_TYPES = {
  MEMBERSHIP_DESTROYED: "groups.v2.events.membership.destroyed",
  MEMBERSHIP_CREATED: "groups.v2.events.membership.created",
  MEMBERSHIP_UPDATED: "groups.v2.events.membership.updated",
  PERSON_CREATED: "people.v2.events.person.created",
  PERSON_UPDATED: "people.v2.events.person.updated",
} as const;

export type WebhookHandlerKind =
  | "membership_destroyed"
  | "membership_upsert"
  | "person_created"
  | "person_updated";

export function resolveWebhookHandler(eventType: string): WebhookHandlerKind | null {
  switch (eventType) {
    case WEBHOOK_EVENT_TYPES.MEMBERSHIP_DESTROYED:
      return "membership_destroyed";
    case WEBHOOK_EVENT_TYPES.MEMBERSHIP_CREATED:
    case WEBHOOK_EVENT_TYPES.MEMBERSHIP_UPDATED:
      return "membership_upsert";
    case WEBHOOK_EVENT_TYPES.PERSON_CREATED:
      return "person_created";
    case WEBHOOK_EVENT_TYPES.PERSON_UPDATED:
      return "person_updated";
    default:
      return null;
  }
}

type EventDeliveryRow = {
  attributes?: { name?: string };
};

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

function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function computeWebhookAuthenticity(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return hexFromBuffer(signature);
}

export async function verifyHmacAuthenticity(
  secret: string,
  rawBody: string,
  authenticityHeader: string | undefined,
): Promise<boolean> {
  if (!authenticityHeader) return false;
  const expected = await computeWebhookAuthenticity(secret, rawBody);
  return timingSafeEqualHex(expected, authenticityHeader);
}

export type WebhookAuthResult =
  | { ok: true; secret: string | null; skipHmac: boolean }
  | { ok: false; reason: "secret_unset" | "invalid_hmac" };

export async function verifyWebhookAuth(params: {
  secrets: string[];
  rawBody: string;
  authenticityHeader: string | undefined;
  allowWithoutSecret?: boolean;
}): Promise<WebhookAuthResult> {
  if (params.secrets.length === 0) {
    if (params.allowWithoutSecret) {
      return { ok: true, secret: null, skipHmac: true };
    }
    return { ok: false, reason: "secret_unset" };
  }

  for (const secret of params.secrets) {
    if (await verifyHmacAuthenticity(secret, params.rawBody, params.authenticityHeader)) {
      return { ok: true, secret, skipHmac: false };
    }
  }

  return { ok: false, reason: "invalid_hmac" };
}
