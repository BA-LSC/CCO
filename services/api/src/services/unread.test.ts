import { describe, expect, test } from "bun:test";
import { hasUnreadFromLastMessage, isUnreadMessage } from "./unread";

describe("unread helpers", () => {
  test("isUnreadMessage ignores own messages", () => {
    expect(
      isUnreadMessage({
        authorId: "user-1",
        createdAt: new Date("2026-01-02T00:00:00Z"),
        userId: "user-1",
        lastReadAt: null,
      }),
    ).toBe(false);
  });

  test("isUnreadMessage treats messages after lastReadAt as unread", () => {
    expect(
      isUnreadMessage({
        authorId: "user-2",
        createdAt: new Date("2026-01-02T00:00:00Z"),
        userId: "user-1",
        lastReadAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBe(true);
  });

  test("hasUnreadFromLastMessage returns false without a last message", () => {
    expect(
      hasUnreadFromLastMessage({
        lastMessage: null,
        userId: "user-1",
        lastReadAt: null,
      }),
    ).toBe(false);
  });
});
