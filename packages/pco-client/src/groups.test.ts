import { describe, expect, test } from "bun:test";
import {
  parseGroupHeaderImageUrl,
  parseGroupRoster,
  parseGroupsListResponse,
  parseMembershipWebhookPayload,
  parseMyGroupMemberships,
  mapPcoMembershipRole,
} from "./groups";

const GROUPS_FIXTURE = {
  data: [
    {
      type: "Group",
      id: "1",
      attributes: { name: "Home Group" },
    },
  ],
};

const MEMBERSHIPS_FIXTURE = {
  data: [
    {
      type: "GroupMembership",
      id: "m1",
      attributes: { role: "leader" },
      relationships: { group: { data: { id: "1" } }, person: { data: { id: "p1" } } },
    },
  ],
  included: [{ type: "Group", id: "1", attributes: { name: "Home Group" } }],
};

const ROSTER_FIXTURE = {
  data: [
    {
      type: "GroupMembership",
      id: "m1",
      attributes: { role: "member" },
      relationships: { person: { data: { id: "p2" } } },
    },
  ],
  included: [
    {
      type: "Person",
      id: "p2",
      attributes: { first_name: "Sam", last_name: "Lee", email: "sam@example.com" },
    },
  ],
};

describe("groups parsing", () => {
  test("parseGroupsListResponse", () => {
    expect(parseGroupsListResponse(GROUPS_FIXTURE)).toEqual([
      { pcoGroupId: "1", name: "Home Group", imageUrl: null },
    ]);
  });

  test("parseGroupHeaderImageUrl prefers thumbnail", () => {
    expect(
      parseGroupHeaderImageUrl({
        thumbnail: "https://example.com/thumb.jpg",
        original: "https://example.com/full.jpg",
      }),
    ).toBe("https://example.com/thumb.jpg");
  });

  test("parseGroupHeaderImageUrl reads nested url", () => {
    expect(parseGroupHeaderImageUrl({ original: { url: "https://example.com/full.jpg" } })).toBe(
      "https://example.com/full.jpg",
    );
  });

  test("parseGroupHeaderImageUrl finds deeply nested url", () => {
    expect(
      parseGroupHeaderImageUrl({
        links: { download: "https://example.com/deep.jpg" },
      }),
    ).toBe("https://example.com/deep.jpg");
  });

  test("parseMyGroupMemberships", () => {
    expect(parseMyGroupMemberships(MEMBERSHIPS_FIXTURE, "p1")).toEqual([
      { pcoGroupId: "1", role: "leader" },
    ]);
  });

  test("parseGroupRoster", () => {
    expect(parseGroupRoster(ROSTER_FIXTURE)).toEqual([
      {
        pcoPersonId: "p2",
        role: "member",
        firstName: "Sam",
        lastName: "Lee",
        email: "sam@example.com",
        avatarUrl: null,
      },
    ]);
  });

  test("mapPcoMembershipRole defaults unknown to member", () => {
    expect(mapPcoMembershipRole("volunteer")).toBe("member");
  });

  test("mapPcoMembershipRole treats group_leader as leader", () => {
    expect(mapPcoMembershipRole("group_leader")).toBe("leader");
  });

  test("parseMembershipWebhookPayload reads relationships", () => {
    expect(
      parseMembershipWebhookPayload({
        data: {
          type: "GroupMembership",
          id: "m1",
          attributes: { role: "member" },
          relationships: {
            group: { data: { id: "g42" } },
            person: { data: { id: "p99" } },
          },
        },
        included: [
          {
            type: "Person",
            id: "p99",
            attributes: { first_name: "Alex", last_name: "Kim", email: "alex@example.com" },
          },
        ],
      }),
    ).toEqual({
      pcoPersonId: "p99",
      pcoGroupId: "g42",
      role: "member",
      displayName: "Alex Kim",
      email: "alex@example.com",
    });
  });

  test("parseMembershipWebhookPayload falls back to attributes", () => {
    expect(
      parseMembershipWebhookPayload({
        data: {
          type: "Membership",
          id: "m1",
          attributes: { person_id: "p1", group_id: "g1", role: "leader" },
        },
      }),
    ).toEqual({
      pcoPersonId: "p1",
      pcoGroupId: "g1",
      role: "leader",
      displayName: undefined,
      email: undefined,
    });
  });

  test("parseMembershipWebhookPayload returns null when ids missing", () => {
    expect(
      parseMembershipWebhookPayload({
        data: { type: "GroupMembership", id: "m1", attributes: {} },
      }),
    ).toBeNull();
  });
});
