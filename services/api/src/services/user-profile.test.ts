import { describe, expect, test } from "bun:test";
import { preferResolvedMemberDisplayName } from "./user-profile";

describe("preferResolvedMemberDisplayName", () => {
  test("uses local name when roster name is placeholder", () => {
    expect(
      preferResolvedMemberDisplayName("Member", { displayName: "Jamie Lee" }),
    ).toBe("Jamie Lee");
  });

  test("keeps roster name when it is real", () => {
    expect(
      preferResolvedMemberDisplayName("Jamie Lee", { displayName: "Member" }),
    ).toBe("Jamie Lee");
  });

  test("keeps roster placeholder when local is also placeholder", () => {
    expect(preferResolvedMemberDisplayName("Member", { displayName: "Member" })).toBe("Member");
  });
});
