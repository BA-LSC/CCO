import { describe, expect, test } from "bun:test";
import { buildDmPairKey } from "./dms";

describe("buildDmPairKey", () => {
  test("is order-independent", () => {
    const a = "550e8400-e29b-41d4-a716-446655440000";
    const b = "660e8400-e29b-41d4-a716-446655440001";
    expect(buildDmPairKey(a, b)).toBe(buildDmPairKey(b, a));
  });

  test("joins sorted ids with colon", () => {
    const low = "aaaa0000-0000-4000-8000-000000000001";
    const high = "bbbb0000-0000-4000-8000-000000000002";
    expect(buildDmPairKey(high, low)).toBe(`${low}:${high}`);
  });
});
