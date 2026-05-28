import { describe, expect, test } from "bun:test";
import {
  WEBHOOK_EVENT_TYPES,
  computeWebhookAuthenticity,
  normalizeWebhookPayload,
  resolveWebhookEventType,
  resolveWebhookHandler,
  shouldAcceptWebhookWithoutSecret,
  verifyHmacAuthenticity,
  verifyWebhookAuth,
} from "./auth";

describe("verifyWebhookAuth", () => {
  const rawBody = JSON.stringify({ data: { type: "Membership" } });
  const secret = "test-webhook-secret";
  const otherSecret = "other-webhook-secret";

  test("rejects when secret unset in production", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_UNAUTH_WEBHOOKS;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_UNAUTH_WEBHOOKS;

    const result = verifyWebhookAuth({
      secrets: [],
      rawBody,
      authenticityHeader: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("secret_unset");

    process.env.NODE_ENV = prevNodeEnv;
    if (prevAllow === undefined) delete process.env.ALLOW_UNAUTH_WEBHOOKS;
    else process.env.ALLOW_UNAUTH_WEBHOOKS = prevAllow;
  });

  test("allows dev bypass when ALLOW_UNAUTH_WEBHOOKS=true", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_UNAUTH_WEBHOOKS;
    process.env.NODE_ENV = "development";
    process.env.ALLOW_UNAUTH_WEBHOOKS = "true";

    expect(shouldAcceptWebhookWithoutSecret()).toBe(true);

    const result = verifyWebhookAuth({
      secrets: [],
      rawBody,
      authenticityHeader: undefined,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipHmac).toBe(true);

    process.env.NODE_ENV = prevNodeEnv;
    if (prevAllow === undefined) delete process.env.ALLOW_UNAUTH_WEBHOOKS;
    else process.env.ALLOW_UNAUTH_WEBHOOKS = prevAllow;
  });

  test("verifies HMAC authenticity header", () => {
    const mac = computeWebhookAuthenticity(secret, rawBody);

    expect(verifyHmacAuthenticity(secret, rawBody, mac)).toBe(true);
    expect(verifyHmacAuthenticity(secret, rawBody, "bad-mac")).toBe(false);

    const result = verifyWebhookAuth({
      secrets: [secret],
      rawBody,
      authenticityHeader: mac,
    });
    expect(result.ok).toBe(true);
  });

  test("accepts when any configured secret matches", () => {
    const mac = computeWebhookAuthenticity(otherSecret, rawBody);

    const result = verifyWebhookAuth({
      secrets: [secret, otherSecret],
      rawBody,
      authenticityHeader: mac,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.secret).toBe(otherSecret);
  });

  test("rejects when no configured secret matches", () => {
    const mac = computeWebhookAuthenticity("unknown-secret", rawBody);

    const result = verifyWebhookAuth({
      secrets: [secret, otherSecret],
      rawBody,
      authenticityHeader: mac,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_hmac");
  });
});

describe("resolveWebhookEventType", () => {
  test("prefers X-PCO-Webhooks-Name header", () => {
    expect(
      resolveWebhookEventType({
        nameHeader: "groups.v2.events.membership.created",
        legacyEventTypeHeader: undefined,
        rawPayload: {},
      }),
    ).toBe("groups.v2.events.membership.created");
  });

  test("falls back to legacy X-PCO-Webhooks-Event-Type header", () => {
    expect(
      resolveWebhookEventType({
        nameHeader: undefined,
        legacyEventTypeHeader: "people.v2.events.person.updated",
        rawPayload: {},
      }),
    ).toBe("people.v2.events.person.updated");
  });

  test("extracts event name from EventDelivery wrapper body", () => {
    expect(
      resolveWebhookEventType({
        nameHeader: undefined,
        legacyEventTypeHeader: undefined,
        rawPayload: {
          data: [
            {
              type: "EventDelivery",
              attributes: { name: "groups.v2.events.membership.destroyed" },
            },
          ],
        },
      }),
    ).toBe("groups.v2.events.membership.destroyed");
  });

  test("returns null when event type cannot be resolved", () => {
    expect(
      resolveWebhookEventType({
        nameHeader: undefined,
        legacyEventTypeHeader: undefined,
        rawPayload: { data: [{ type: "Person" }] },
      }),
    ).toBeNull();
  });
});

describe("resolveWebhookHandler", () => {
  test("matches exact PCO event types", () => {
    expect(resolveWebhookHandler(WEBHOOK_EVENT_TYPES.MEMBERSHIP_DESTROYED)).toBe(
      "membership_destroyed",
    );
    expect(resolveWebhookHandler(WEBHOOK_EVENT_TYPES.MEMBERSHIP_CREATED)).toBe(
      "membership_upsert",
    );
    expect(resolveWebhookHandler(WEBHOOK_EVENT_TYPES.MEMBERSHIP_UPDATED)).toBe(
      "membership_upsert",
    );
    expect(resolveWebhookHandler(WEBHOOK_EVENT_TYPES.PERSON_CREATED)).toBe("person_created");
    expect(resolveWebhookHandler(WEBHOOK_EVENT_TYPES.PERSON_UPDATED)).toBe("person_updated");
  });

  test("rejects partial or body-derived event strings", () => {
    expect(resolveWebhookHandler("membership.destroyed")).toBeNull();
    expect(resolveWebhookHandler("groups.v2.events.membership.created.extra")).toBeNull();
    expect(resolveWebhookHandler("")).toBeNull();
  });
});

describe("normalizeWebhookPayload", () => {
  test("reads delivery_id from meta", () => {
    const body = { meta: { delivery_id: "del-123" }, data: { type: "Membership" } };
    expect(normalizeWebhookPayload(body)).toEqual({
      deliveryId: "del-123",
      body,
    });
  });

  test("unwraps EventDelivery wrapper and parses inner payload", () => {
    const inner = {
      meta: { delivery_id: "inner-del" },
      data: {
        type: "GroupMembership",
        id: "m1",
        attributes: { role: "member" },
        relationships: {
          person: { data: { id: "p1" } },
          group: { data: { id: "g1" } },
        },
      },
    };
    const outer = {
      data: [
        {
          id: "outer-del",
          type: "EventDelivery",
          attributes: { payload: JSON.stringify(inner) },
        },
      ],
    };

    expect(normalizeWebhookPayload(outer)).toEqual({
      deliveryId: "inner-del",
      body: inner,
    });
  });
});
