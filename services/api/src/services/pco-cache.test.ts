import { describe, expect, it } from "vitest";
import {
  isSyncedAtStale,
  parseServiceTypeNames,
  PCO_MEMBERSHIP_STALE_MS,
  serializeServiceTypeNames,
} from "./pco-cache";

describe("pco-cache", () => {
  it("detects stale syncedAt timestamps", () => {
    const fresh = new Date(Date.now() - PCO_MEMBERSHIP_STALE_MS + 60_000);
    const stale = new Date(Date.now() - PCO_MEMBERSHIP_STALE_MS - 60_000);

    expect(isSyncedAtStale(fresh)).toBe(false);
    expect(isSyncedAtStale(stale)).toBe(true);
  });

  it("round-trips service type names", () => {
    const names = ["Band", "Vocals"];
    expect(parseServiceTypeNames(serializeServiceTypeNames(names))).toEqual(names);
    expect(parseServiceTypeNames(null)).toEqual([]);
    expect(serializeServiceTypeNames([])).toBeNull();
  });
});
