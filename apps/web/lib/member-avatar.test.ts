import { describe, expect, test } from "bun:test";
import { resolveMemberAvatarUrl } from "./member-avatar";

describe("resolveMemberAvatarUrl", () => {
  test("uses session avatar for the signed-in member", () => {
    expect(
      resolveMemberAvatarUrl(
        { id: "user-1", avatarUrl: null },
        { userId: "user-1", avatarUrl: "https://example.com/me.jpg" },
      ),
    ).toBe("https://example.com/me.jpg");
  });

  test("keeps member avatar for other users", () => {
    expect(
      resolveMemberAvatarUrl(
        { id: "user-2", avatarUrl: "https://example.com/other.jpg" },
        { userId: "user-1", avatarUrl: "https://example.com/me.jpg" },
      ),
    ).toBe("https://example.com/other.jpg");
  });
});
