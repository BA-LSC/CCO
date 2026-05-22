import { describe, expect, test } from "bun:test";
import {
  buildLocalMemberLookups,
  buildSignedUpMemberIndex,
  buildSignedUpMemberRecords,
  findLocalMember,
  findSignedUpMember,
  memberIsOnCco,
  namesLikelyMatch,
  resolveRosterMemberLink,
  type SignedUpMemberIndex,
  type SignedUpMemberRecord,
} from "./cco-member-status";

function index(overrides: Partial<SignedUpMemberIndex> = {}): SignedUpMemberIndex {
  return {
    pcoPersonIds: new Set(),
    userIds: new Set(),
    emails: new Set(),
    displayNames: new Set(),
    ...overrides,
  };
}

describe("memberIsOnCco", () => {
  test("matches by PCO person id", () => {
    expect(
      memberIsOnCco(
        { pcoPersonId: "123", email: "noah@example.com" },
        undefined,
        index({ pcoPersonIds: new Set(["123"]) }),
      ),
    ).toBe(true);
  });

  test("matches linked group member when roster id differs", () => {
    expect(
      memberIsOnCco(
        { pcoPersonId: "roster-id", email: "noah@example.com" },
        "user-uuid",
        index({ userIds: new Set(["user-uuid"]) }),
      ),
    ).toBe(true);
  });

  test("matches by email when ids differ", () => {
    expect(
      memberIsOnCco(
        { pcoPersonId: "roster-id", email: "noah@example.com" },
        undefined,
        index({ emails: new Set(["noah@example.com"]) }),
      ),
    ).toBe(true);
  });

  test("matches by display name when ids and roster email differ", () => {
    expect(
      memberIsOnCco(
        {
          pcoPersonId: "roster-id",
          email: null,
          displayName: "Noah Passeau",
        },
        undefined,
        index({ displayNames: new Set(["noah passeau"]) }),
      ),
    ).toBe(true);
  });

  test("ignores placeholder emails", () => {
    expect(
      memberIsOnCco(
        { pcoPersonId: "123", email: "123@placeholder.local" },
        undefined,
        index({ emails: new Set(["123@placeholder.local"]) }),
      ),
    ).toBe(false);
  });

  test("matches via signed-up records when local placeholder name blocked index lookup", () => {
    const records: SignedUpMemberRecord[] = [
      {
        userId: "user-noah",
        pcoPersonId: "oauth-id",
        email: "noah@example.com",
        displayName: "noah passeau",
      },
    ];

    expect(
      memberIsOnCco(
        {
          pcoPersonId: "roster-id",
          email: null,
          displayName: "Noah Passeau",
        },
        "placeholder-user-id",
        index(),
        records,
      ),
    ).toBe(true);
  });
});

describe("resolveRosterMemberLink", () => {
  test("prefers signed-up user over local placeholder id", () => {
    const records: SignedUpMemberRecord[] = [
      {
        userId: "user-noah",
        pcoPersonId: "oauth-id",
        email: null,
        displayName: "noah passeau",
      },
    ];

    expect(
      resolveRosterMemberLink(
        {
          pcoPersonId: "roster-id",
          displayName: "Noah Passeau",
          firstName: "Noah",
          lastName: "Passeau",
        },
        "placeholder-user-id",
        index(),
        records,
      ),
    ).toEqual({ onCco: true, userId: "user-noah" });
  });

  test("uses local user when they have oauth credentials", () => {
    expect(
      resolveRosterMemberLink(
        { pcoPersonId: "123", displayName: "Noah Passeau" },
        "user-uuid",
        index({ userIds: new Set(["user-uuid"]) }),
        [],
      ),
    ).toEqual({ onCco: true, userId: "user-uuid" });
  });
});

describe("findLocalMember", () => {
  test("falls back to email when PCO person ids differ", () => {
    const lookups = buildLocalMemberLookups([
      {
        pcoPersonId: "local-id",
        email: "noah@example.com",
        id: "user-1",
      },
    ]);

    expect(
      findLocalMember({ pcoPersonId: "roster-id", email: "noah@example.com" }, lookups),
    ).toEqual({
      pcoPersonId: "local-id",
      email: "noah@example.com",
      id: "user-1",
    });
  });

  test("falls back to display name when ids and email differ", () => {
    const lookups = buildLocalMemberLookups([
      {
        pcoPersonId: "local-id",
        email: "123@placeholder.local",
        displayName: "Noah Passeau",
        id: "user-1",
      },
    ]);

    expect(
      findLocalMember(
        { pcoPersonId: "roster-id", email: null, displayName: "Noah Passeau" },
        lookups,
      ),
    ).toEqual({
      pcoPersonId: "local-id",
      email: "123@placeholder.local",
      displayName: "Noah Passeau",
      id: "user-1",
    });
  });
});

describe("findSignedUpMember", () => {
  test("matches by fuzzy display name", () => {
    const records: SignedUpMemberRecord[] = [
      {
        userId: "user-noah",
        pcoPersonId: "oauth-id",
        email: null,
        displayName: "noah j passeau",
      },
    ];

    expect(
      findSignedUpMember(
        { pcoPersonId: "roster-id", email: null, displayName: "Noah Passeau" },
        records,
      ),
    ).toEqual(records[0]);
  });
});

describe("namesLikelyMatch", () => {
  test("requires two shared tokens for full names", () => {
    expect(namesLikelyMatch("Noah Passeau", "Noah Passeau")).toBe(true);
    expect(namesLikelyMatch("John Smith", "John Doe")).toBe(false);
  });

  test("matches same last name with compatible first names", () => {
    expect(namesLikelyMatch("Noah Passeau", "N Passeau")).toBe(true);
  });
});
