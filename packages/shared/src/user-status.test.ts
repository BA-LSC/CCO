import { describe, expect, test } from "bun:test";
import {
  isManualUserStatus,
  parseUserStatusPreset,
  resolveEffectivePreset,
  resolvePresenceDotState,
} from "./user-status";

describe("user status", () => {
  test("parseUserStatusPreset defaults to active", () => {
    expect(parseUserStatusPreset(null)).toBe("active");
    expect(parseUserStatusPreset("invalid")).toBe("active");
    expect(parseUserStatusPreset("busy")).toBe("busy");
    expect(parseUserStatusPreset("offline")).toBe("offline");
  });

  test("isManualUserStatus detects manual overrides", () => {
    expect(isManualUserStatus({ preset: "active", message: null })).toBe(false);
    expect(isManualUserStatus({ preset: "active", message: "In a meeting" })).toBe(true);
    expect(isManualUserStatus({ preset: "away", message: null })).toBe(true);
  });

  test("resolveEffectivePreset auto switches between active and away", () => {
    const auto = { preset: "active" as const, message: null };
    expect(
      resolveEffectivePreset(auto, { pageActive: true, idle: false }),
    ).toBe("active");
    expect(
      resolveEffectivePreset(auto, { pageActive: false, idle: false }),
    ).toBe("away");
    expect(
      resolveEffectivePreset(auto, { pageActive: true, idle: true }),
    ).toBe("away");
    expect(
      resolveEffectivePreset({ preset: "busy", message: null }, { pageActive: true, idle: false }),
    ).toBe("busy");
  });

  test("resolvePresenceDotState respects manual presets", () => {
    expect(resolvePresenceDotState("active", true)).toBe("online");
    expect(resolvePresenceDotState("active", false)).toBe("away");
    expect(resolvePresenceDotState("away", true)).toBe("away");
    expect(resolvePresenceDotState("busy", false)).toBe("busy");
    expect(resolvePresenceDotState("offline", true)).toBe("offline");
  });
});
