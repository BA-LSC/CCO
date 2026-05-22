import { describe, expect, test } from "bun:test";
import {
  isManualUserStatus,
  normalizeUserStatusPreset,
  parseUserStatusPreset,
  resolveEffectivePreset,
  resolvePresenceDotState,
} from "./user-status";

describe("user status", () => {
  test("parseUserStatusPreset normalizes legacy presets to active", () => {
    expect(parseUserStatusPreset(null)).toBe("active");
    expect(parseUserStatusPreset("invalid")).toBe("active");
    expect(parseUserStatusPreset("away")).toBe("active");
    expect(parseUserStatusPreset("busy")).toBe("active");
    expect(parseUserStatusPreset("offline")).toBe("offline");
  });

  test("normalizeUserStatusPreset collapses legacy presets", () => {
    expect(normalizeUserStatusPreset("active")).toBe("active");
    expect(normalizeUserStatusPreset("away")).toBe("active");
    expect(normalizeUserStatusPreset("busy")).toBe("active");
    expect(normalizeUserStatusPreset("offline")).toBe("offline");
  });

  test("isManualUserStatus detects offline and status messages", () => {
    expect(isManualUserStatus({ preset: "active", message: null })).toBe(false);
    expect(isManualUserStatus({ preset: "active", message: "In a meeting" })).toBe(true);
    expect(isManualUserStatus({ preset: "offline", message: null })).toBe(true);
    expect(isManualUserStatus({ preset: "away", message: null })).toBe(false);
  });

  test("resolveEffectivePreset returns active or offline only", () => {
    const auto = { preset: "active" as const, message: null };
    expect(
      resolveEffectivePreset(auto, { pageActive: true, idle: false }),
    ).toBe("active");
    expect(
      resolveEffectivePreset(auto, { pageActive: false, idle: false }),
    ).toBe("active");
    expect(
      resolveEffectivePreset({ preset: "offline", message: null }, { pageActive: true, idle: false }),
    ).toBe("offline");
  });

  test("resolvePresenceDotState uses online/offline for active mode", () => {
    expect(resolvePresenceDotState("active", true)).toBe("online");
    expect(resolvePresenceDotState("active", false)).toBe("offline");
    expect(resolvePresenceDotState("away", true)).toBe("online");
    expect(resolvePresenceDotState("busy", false)).toBe("offline");
    expect(resolvePresenceDotState("offline", true)).toBe("offline");
    expect(resolvePresenceDotState("offline", false)).toBe("offline");
  });
});
