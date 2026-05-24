import { describe, expect, test } from "bun:test";
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
