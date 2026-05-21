import { describe, expect, test } from "bun:test";
import { handleMembershipDestroyed, resolveWebhookMembershipRole } from "./membership";

describe("handleMembershipDestroyed", () => {
  test("returns false when ids missing", async () => {
    const result = await handleMembershipDestroyed({
      data: { type: "Membership", attributes: {} },
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
