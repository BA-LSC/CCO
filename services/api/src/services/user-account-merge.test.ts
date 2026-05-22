import { describe, expect, test } from "bun:test";
import { namesLikelyMatch, normalizeMemberEmail } from "./cco-member-status";

describe("placeholder merge matching", () => {
  test("real emails match across placeholder and oauth accounts", () => {
    expect(normalizeMemberEmail("noah@example.com")).toBe("noah@example.com");
    expect(normalizeMemberEmail("123@placeholder.local")).toBeNull();
  });

  test("roster name matches oauth account after webhook placeholder name", () => {
    expect(namesLikelyMatch("Noah Passeau", "Member")).toBe(false);
    expect(namesLikelyMatch("Noah Passeau", "Noah Passeau")).toBe(true);
  });
});
