import { describe, expect, test } from "bun:test";
import { parseUserTheme } from "./theme";

describe("parseUserTheme", () => {
  test("accepts themes 1 through 11", () => {
    for (const theme of [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
    ] as const) {
      expect(parseUserTheme(theme)).toBe(theme);
    }
  });

  test("rejects invalid values", () => {
    expect(parseUserTheme("12")).toBeNull();
    expect(parseUserTheme("chaos")).toBeNull();
    expect(parseUserTheme(null)).toBeNull();
    expect(parseUserTheme(1)).toBeNull();
  });
});
