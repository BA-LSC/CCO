import { describe, expect, test } from "bun:test";
import { parseMembershipWebhookPayload } from "@cco/pco-client";
import { handleMembershipDestroyed, resolveWebhookMembershipRole } from "./membership";

describe("parseMembershipWebhookPayload", () => {
  test("matches real PCO webhook shape", () => {
    const parsed = parseMembershipWebhookPayload({
      data: {
        type: "GroupMembership",
        id: "12345",
        attributes: { role: "member" },
        relationships: {
          person: { data: { type: "Person", id: "67890" } },
          group: { data: { type: "Group", id: "11111" } },
        },
      },
    });
    expect(parsed?.pcoPersonId).toBe("67890");
    expect(parsed?.pcoGroupId).toBe("11111");
  });
});

describe("handleMembershipDestroyed", () => {
  test("returns false when ids missing", async () => {
    const result = await handleMembershipDestroyed({
      data: { type: "Membership", id: "m1", attributes: {} },
    });
    expect(result).toBe(false);
  });
});

describe("resolveWebhookMembershipRole", () => {
  test("always defaults to member regardless of payload role", () => {
    expect(resolveWebhookMembershipRole("leader")).toBe("member");
    expect(resolveWebhookMembershipRole("admin")).toBe("member");
    expect(resolveWebhookMembershipRole("member")).toBe("member");
    expect(resolveWebhookMembershipRole(undefined)).toBe("member");
  });
});
