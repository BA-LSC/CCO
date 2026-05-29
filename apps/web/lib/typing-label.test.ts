import { describe, expect, test } from "bun:test";
import { formatTypingLabel } from "./typing-label";

describe("formatTypingLabel", () => {
  test("returns null for empty names", () => {
    expect(formatTypingLabel([])).toBeNull();
    expect(formatTypingLabel(["", "  "])).toBeNull();
  });

  test("formats one or two typers", () => {
    expect(formatTypingLabel(["Sam"])).toBe("Sam is typing");
    expect(formatTypingLabel(["Sam", "Alex"])).toBe("Sam and Alex are typing");
  });

  test("formats many typers generically", () => {
    expect(formatTypingLabel(["Sam", "Alex", "Jordan"])).toBe("Several people are typing");
  });
});
