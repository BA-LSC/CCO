import { describe, expect, test } from "bun:test";
import { shouldApplyCallLeave } from "@cco/shared/calls";
import { generateInviteToken, hashInviteToken } from "./calls";

describe("call invite tokens", () => {
  test("hash is stable for same raw token", () => {
    const raw = "test-token-value";
    expect(hashInviteToken(raw)).toBe(hashInviteToken(raw));
  });

  test("generateInviteToken produces unique values", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("shouldApplyCallLeave", () => {
  test("applies leave when joinEpoch matches participant joinedAt", () => {
    expect(
      shouldApplyCallLeave({ joinEpoch: 1_700_000_000_000, participantJoinedAtMs: 1_700_000_000_000 }),
    ).toBe(true);
  });

  test("skips leave when joinEpoch is stale after rejoin elsewhere", () => {
    expect(
      shouldApplyCallLeave({ joinEpoch: 1_700_000_000_000, participantJoinedAtMs: 1_700_000_000_500 }),
    ).toBe(false);
  });

  test("applies leave when joinEpoch is omitted", () => {
    expect(shouldApplyCallLeave({ participantJoinedAtMs: 1_700_000_000_000 })).toBe(true);
  });
});
