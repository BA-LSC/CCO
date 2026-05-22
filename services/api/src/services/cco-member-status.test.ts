import { describe, expect, test } from "bun:test";
import {
  buildLocalMemberLookups,
  findLocalMember,
  memberIsOnCco,
  type SignedUpMemberIndex,
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
});
