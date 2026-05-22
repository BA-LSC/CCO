import { describe, expect, test } from "bun:test";
import { parseUserStatusPreset, resolvePresenceDotState } from "./user-status";

describe("user status", () => {
  test("parseUserStatusPreset defaults to active", () => {
    expect(parseUserStatusPreset(null)).toBe("active");
    expect(parseUserStatusPreset("invalid")).toBe("active");
    expect(parseUserStatusPreset("busy")).toBe("busy");
  });

  test("resolvePresenceDotState respects manual presets", () => {
    expect(resolvePresenceDotState("active", true)).toBe("online");
    expect(resolvePresenceDotState("active", false)).toBe("offline");
    expect(resolvePresenceDotState("away", true)).toBe("away");
    expect(resolvePresenceDotState("busy", false)).toBe("busy");
  });
});
