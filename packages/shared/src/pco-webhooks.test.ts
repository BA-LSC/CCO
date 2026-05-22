import { describe, expect, test } from "bun:test";
import { PCO_WEBHOOK_EVENT_TYPES, PCO_WEBHOOK_SUBSCRIPTIONS } from "./pco-webhooks";

describe("PCO webhook subscriptions", () => {
  test("lists the four required subscriptions", () => {
    expect(PCO_WEBHOOK_SUBSCRIPTIONS).toHaveLength(4);
    expect(PCO_WEBHOOK_EVENT_TYPES).toEqual([
      "groups.v2.events.membership.created",
      "groups.v2.events.membership.updated",
      "groups.v2.events.membership.destroyed",
      "people.v2.events.person.updated",
    ]);
  });
});
