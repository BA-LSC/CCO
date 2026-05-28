import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseMembershipWebhookPayload } from "@cco/pco-client";

const upsertGroupMembershipCalls: Array<{ groupId: string; userId: string; role: string }> = [];
const ensureConversationMemberCalls: Array<{ conversationId: string; userId: string }> = [];
const upsertUserFromPcoCalls: Array<{
  organizationId: string;
  profile: {
    personId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  };
}> = [];
let syncGroupRosterCalls = 0;
let removeGroupMembershipResult = true;
let orgPcoAccessToken: string | null = null;
let refreshRoleCalled = false;

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => ({
    limit: async () => result,
  });
  return chain;
}

function registerMocks() {
  mock.module("../../db", () => ({
    db: {
      select: () => makeSelectChain([{ id: "group-local-1", organizationId: "org-1" }]),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    },
  }));

  mock.module("../../services/bootstrap", () => ({
    upsertUserFromPco: async (
      organizationId: string,
      profile: {
        personId: string;
        email: string;
        displayName: string;
        avatarUrl?: string;
      },
    ) => {
      upsertUserFromPcoCalls.push({ organizationId, profile });
      return "user-local-1";
    },
  }));

  mock.module("../../services/conversations", () => ({
    ensureGeneralConversation: async () => "conv-general-1",
    ensureConversationMember: async (conversationId: string, userId: string) => {
      ensureConversationMemberCalls.push({ conversationId, userId });
    },
  }));

  mock.module("../../services/group-sync", () => ({
    upsertGroupMembership: async (params: { groupId: string; userId: string; role: string }) => {
      upsertGroupMembershipCalls.push(params);
    },
    refreshUserGroupRoleFromPco: async () => {
      refreshRoleCalled = true;
      return "leader";
    },
    removeGroupMembership: async () => removeGroupMembershipResult,
    syncGroupRoster: async () => {
      syncGroupRosterCalls += 1;
      return { upserted: 0, removed: 0 };
    },
  }));

  mock.module("../../services/org-config", () => ({
    getOrgPcoAccessToken: async () => orgPcoAccessToken,
  }));

  mock.module("../../services/org-oauth", () => ({
    getConfiguredOrganization: async () => ({ id: "org-1" }),
  }));
}

registerMocks();

describe("parseMembershipWebhookPayload", () => {
  test("matches real PCO webhook shape", () => {
    const parsed = parseMembershipWebhookPayload({
      data: {
        type: "GroupMembership",
        id: "12345",
        attributes: { role: "member" },
        relationships: {
          person: { data: { type: "Person", id: "67890" } },
          group: { data: { type: "Group", id: "11111" } },
        },
      },
    });
    expect(parsed?.pcoPersonId).toBe("67890");
    expect(parsed?.pcoGroupId).toBe("11111");
  });
});

describe("handleMembershipDestroyed", () => {
  test("returns false when ids missing", async () => {
    const { handleMembershipDestroyed } = await import(
      `./membership?t=${Date.now()}`
    );
    const result = await handleMembershipDestroyed({
      data: { type: "Membership", id: "m1", attributes: {} },
    });
    expect(result).toBe(false);
  });

  test("delegates to removeGroupMembership when ids present", async () => {
    removeGroupMembershipResult = true;
    const { handleMembershipDestroyed } = await import(
      `./membership?t=${Date.now()}`
    );
    const result = await handleMembershipDestroyed({
      data: {
        type: "GroupMembership",
        id: "m1",
        attributes: { role: "member" },
        relationships: {
          person: { data: { type: "Person", id: "p1" } },
          group: { data: { type: "Group", id: "g1" } },
        },
      },
    });
    expect(result).toBe(true);
  });
});

describe("handleMembershipUpsert", () => {
  beforeEach(() => {
    upsertGroupMembershipCalls.length = 0;
    ensureConversationMemberCalls.length = 0;
    syncGroupRosterCalls = 0;
    refreshRoleCalled = false;
    orgPcoAccessToken = null;
    registerMocks();
  });

  test("uses mapped role from payload and never calls syncGroupRoster", async () => {
    const { handleMembershipUpsert } = await import(`./membership?t=${Date.now()}`);

    const result = await handleMembershipUpsert({
      data: {
        type: "GroupMembership",
        id: "m1",
        attributes: { role: "group_leader" },
        relationships: {
          person: { data: { type: "Person", id: "p1" } },
          group: { data: { type: "Group", id: "g1" } },
        },
      },
    });

    expect(result).toBe(true);
    expect(upsertGroupMembershipCalls).toEqual([
      { groupId: "group-local-1", userId: "user-local-1", role: "leader" },
    ]);
    expect(syncGroupRosterCalls).toBe(0);
    expect(refreshRoleCalled).toBe(false);
  });

  test("adds only the upserted user to the general conversation", async () => {
    const { handleMembershipUpsert } = await import(`./membership?t=${Date.now()}`);

    await handleMembershipUpsert({
      data: {
        type: "GroupMembership",
        id: "m1",
        attributes: { role: "member" },
        relationships: {
          person: { data: { type: "Person", id: "p1" } },
          group: { data: { type: "Group", id: "g1" } },
        },
      },
    });

    expect(ensureConversationMemberCalls).toEqual([
      { conversationId: "conv-general-1", userId: "user-local-1" },
    ]);
    expect(syncGroupRosterCalls).toBe(0);
  });

  test("defaults to member and refreshes role when payload has no role", async () => {
    orgPcoAccessToken = "org-token";

    const { handleMembershipUpsert } = await import(`./membership?t=${Date.now()}`);

    await handleMembershipUpsert({
      data: {
        type: "GroupMembership",
        id: "m1",
        attributes: {},
        relationships: {
          person: { data: { type: "Person", id: "p1" } },
          group: { data: { type: "Group", id: "g1" } },
        },
      },
    });

    expect(upsertGroupMembershipCalls[0]?.role).toBe("member");
    expect(refreshRoleCalled).toBe(true);
    expect(syncGroupRosterCalls).toBe(0);
  });
});

describe("handlePersonCreated", () => {
  beforeEach(() => {
    upsertUserFromPcoCalls.length = 0;
    registerMocks();
  });

  test("upserts local user from person.created payload", async () => {
    const { handlePersonCreated } = await import(`./membership?t=${Date.now()}`);

    const result = await handlePersonCreated({
      data: {
        id: "p-new",
        attributes: {
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@example.com",
          avatar_url: "https://example.com/avatar.jpg",
        },
      },
    });

    expect(result).toBe(true);
    expect(upsertUserFromPcoCalls).toEqual([
      {
        organizationId: "org-1",
        profile: {
          personId: "p-new",
          email: "jane@example.com",
          displayName: "Jane Doe",
          avatarUrl: "https://example.com/avatar.jpg",
        },
      },
    ]);
  });

  test("uses placeholder email when payload has no email", async () => {
    const { handlePersonCreated } = await import(`./membership?t=${Date.now()}`);

    const result = await handlePersonCreated({
      data: {
        id: "p-no-email",
        attributes: {
          first_name: "Sam",
        },
      },
    });

    expect(result).toBe(true);
    expect(upsertUserFromPcoCalls[0]?.profile.email).toBe("p-no-email@placeholder.local");
    expect(upsertUserFromPcoCalls[0]?.profile.displayName).toBe("Sam");
  });
});
