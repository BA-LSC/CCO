import { describe, expect, test } from "bun:test";
import {
  AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES,
  AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES,
  normalizeAutoUpdateCheckIntervalMinutes,
} from "./release-index.js";

describe("normalizeAutoUpdateCheckIntervalMinutes", () => {
  test("defaults when missing or invalid", () => {
    expect(normalizeAutoUpdateCheckIntervalMinutes(null)).toBe(
      AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES,
    );
    expect(normalizeAutoUpdateCheckIntervalMinutes(undefined)).toBe(
      AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES,
    );
    expect(normalizeAutoUpdateCheckIntervalMinutes(Number.NaN)).toBe(
      AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES,
    );
  });

  test("enforces minimum", () => {
    expect(normalizeAutoUpdateCheckIntervalMinutes(5)).toBe(
      AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES,
    );
    expect(normalizeAutoUpdateCheckIntervalMinutes(10)).toBe(10);
    expect(normalizeAutoUpdateCheckIntervalMinutes(10.9)).toBe(10);
  });
});
