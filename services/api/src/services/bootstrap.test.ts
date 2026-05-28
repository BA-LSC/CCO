import { describe, expect, test } from "bun:test";
import { isPlaceholderDisplayName } from "./cco-member-status";

describe("upsertUserFromPco display name preservation", () => {
  test("detects Member as placeholder", () => {
    expect(isPlaceholderDisplayName("Member")).toBe(true);
  });

  test("does not treat real names as placeholders", () => {
    expect(isPlaceholderDisplayName("Gabreil Bodensteiner")).toBe(false);
  });
});
