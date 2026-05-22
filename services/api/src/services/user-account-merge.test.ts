import { describe, expect, test } from "bun:test";
import { mergeSignedUpMemberRecords, namesLikelyMatch } from "./cco-member-status";
import { usersLikelySamePerson } from "./user-account-merge";

describe("placeholder merge matching", () => {
  test("real emails match across placeholder and oauth accounts", () => {
    expect(namesLikelyMatch("Noah Passeau", "Noah Passeau")).toBe(true);
  });

  test("roster placeholder with real email matches oauth account by display name", () => {
    expect(
      usersLikelySamePerson(
        {
          pcoPersonId: "oauth-id",
          email: "noah@example.com",
          displayName: "Noah Passeau",
        },
        {
          pcoPersonId: "roster-id",
          email: "noah@church.org",
          displayName: "Noah Passeau",
        },
      ),
    ).toBe(true);
  });

  test("webhook member placeholder still requires pco id or name match", () => {
    expect(
      usersLikelySamePerson(
        {
          pcoPersonId: "oauth-id",
          email: "noah@example.com",
          displayName: "Noah Passeau",
        },
        {
          pcoPersonId: "other-id",
          email: "other@placeholder.local",
          displayName: "Member",
        },
      ),
    ).toBe(false);
  });
});

describe("mergeSignedUpMemberRecords", () => {
  test("dedupes by user id and prefers later records", () => {
    const merged = mergeSignedUpMemberRecords(
      [
        {
          userId: "user-1",
          pcoPersonId: "a",
          email: "noah@example.com",
          displayName: "noah passeau",
        },
      ],
      [
        {
          userId: "user-1",
          pcoPersonId: "b",
          email: "noah@example.com",
          displayName: "noah passeau",
        },
        {
          userId: "user-2",
          pcoPersonId: "c",
          email: null,
          displayName: "brian anderson",
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.userId === "user-1")?.pcoPersonId).toBe("b");
  });
});
