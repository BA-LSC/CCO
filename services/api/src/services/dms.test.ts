import { describe, expect, test } from "bun:test";
import { buildDmPairKey, resolveDmEligibleUserIds } from "./dms";
import type { SignedUpMemberRecord } from "./cco-member-status";

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

describe("resolveDmEligibleUserIds", () => {
  const signedUpRecords: SignedUpMemberRecord[] = [
    {
      userId: "user-noah",
      pcoPersonId: "oauth-noah",
      email: "noah@example.com",
      displayName: "noah passeau",
    },
    {
      userId: "user-brian",
      pcoPersonId: "oauth-brian",
      email: "brian@example.com",
      displayName: "brian anderson",
    },
  ];

  test("includes signed-up co-members directly", () => {
    const eligible = resolveDmEligibleUserIds(
      "self",
      [
        {
          id: "user-brian",
          pcoPersonId: "oauth-brian",
          email: "brian@example.com",
          displayName: "Brian Anderson",
        },
      ],
      signedUpRecords,
    );

    expect([...eligible]).toEqual(["user-brian"]);
  });

  test("maps roster placeholder rows to signed-up oauth accounts", () => {
    const eligible = resolveDmEligibleUserIds(
      "self",
      [
        {
          id: "placeholder-noah",
          pcoPersonId: "roster-noah",
          email: "roster-noah@placeholder.local",
          displayName: "Noah Passeau",
        },
      ],
      signedUpRecords,
    );

    expect([...eligible]).toEqual(["user-noah"]);
  });

  test("includes team and group members without duplicate ids", () => {
    const eligible = resolveDmEligibleUserIds(
      "self",
      [
        {
          id: "user-brian",
          pcoPersonId: "oauth-brian",
          email: "brian@example.com",
          displayName: "Brian Anderson",
        },
        {
          id: "user-brian",
          pcoPersonId: "oauth-brian",
          email: "brian@example.com",
          displayName: "Brian Anderson",
        },
      ],
      signedUpRecords,
    );

    expect([...eligible]).toEqual(["user-brian"]);
  });
});
