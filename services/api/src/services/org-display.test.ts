import { describe, expect, test } from "bun:test";
import { resolveChurchDisplayName } from "./org-display";

describe("resolveChurchDisplayName", () => {
  test("returns trimmed name", () => {
    expect(resolveChurchDisplayName("  Lake Sawyer Church  ")).toBe("Lake Sawyer Church");
  });

  test("rejects pending placeholder", () => {
    expect(resolveChurchDisplayName("Pending setup")).toBeNull();
  });

  test("rejects empty values", () => {
    expect(resolveChurchDisplayName(null)).toBeNull();
    expect(resolveChurchDisplayName("   ")).toBeNull();
  });
});
