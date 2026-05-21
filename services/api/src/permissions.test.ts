import { describe, expect, test } from "bun:test";
import { canCreateConversation, canDeleteMessage, canPostInConversation, isLeaderRole } from "./permissions";

describe("permissions", () => {
  test("isLeaderRole", () => {
    expect(isLeaderRole("leader")).toBe(true);
    expect(isLeaderRole("member")).toBe(false);
  });

  test("canPostInConversation leader-only", () => {
    expect(canPostInConversation({ membershipRole: "member", leaderOnly: true })).toBe(false);
    expect(canPostInConversation({ membershipRole: "leader", leaderOnly: true })).toBe(true);
  });

  test("canCreateConversation", () => {
    expect(canCreateConversation("admin")).toBe(true);
    expect(canCreateConversation("member")).toBe(false);
  });

  test("canDeleteMessage allows author or leader", () => {
    expect(
      canDeleteMessage({ authorId: "u1", userId: "u1", membershipRole: "member" }),
    ).toBe(true);
    expect(
      canDeleteMessage({ authorId: "u1", userId: "u2", membershipRole: "leader" }),
    ).toBe(true);
    expect(
      canDeleteMessage({ authorId: "u1", userId: "u2", membershipRole: "member" }),
    ).toBe(false);
  });
});
