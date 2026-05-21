import { describe, expect, test, mock, beforeEach } from "bun:test";

let updateCalled = false;
let selectCallIndex = 0;
const selectResponses: unknown[][] = [];

function makeSelectChain() {
  const next = () => selectResponses[selectCallIndex++] ?? [];
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.limit = async () => next();
  chain.where = () =>
    Object.assign(Object.create(chain), {
      limit: async () => next(),
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(next()).then(onF, onR);
      },
    });
  return chain;
}

mock.module("../db", () => ({
  db: {
    select: () => makeSelectChain(),
    update: () => ({
      set: () => ({
        where: async () => {
          updateCalled = true;
          return [];
        },
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => {},
        returning: async () => [{ id: "new-conv" }],
      }),
    }),
    delete: () => ({
      where: async () => {},
    }),
  },
}));

describe("conversations service IDOR protections", () => {
  beforeEach(() => {
    updateCalled = false;
    selectCallIndex = 0;
    selectResponses.length = 0;
  });

  test("archiveConversation returns false when conversation is not in group", async () => {
    selectResponses.push([{ role: "leader" }]);
    selectResponses.push([]);

    const { archiveConversation } = await import("./conversations");
    const result = await archiveConversation({
      conversationId: "conv-1",
      groupId: "wrong-group",
      userId: "user-1",
    });

    expect(result).toBe(false);
    expect(updateCalled).toBe(false);
  });

  test("archiveConversation archives when conversation belongs to group", async () => {
    selectResponses.push([{ role: "leader" }]);
    selectResponses.push([{ slug: "announcements" }]);

    const { archiveConversation } = await import("./conversations");
    const result = await archiveConversation({
      conversationId: "conv-1",
      groupId: "group-1",
      userId: "user-1",
    });

    expect(result).toBe(true);
    expect(updateCalled).toBe(true);
  });

  test("archiveConversation refuses to archive general channel", async () => {
    selectResponses.push([{ role: "leader" }]);
    selectResponses.push([{ slug: "general" }]);

    const { archiveConversation } = await import("./conversations");
    const result = await archiveConversation({
      conversationId: "conv-1",
      groupId: "group-1",
      userId: "user-1",
    });

    expect(result).toBe(false);
    expect(updateCalled).toBe(false);
  });

  test("getConversationMembers returns null when conversation is not in group", async () => {
    selectResponses.push([{ id: "membership-1" }]);
    selectResponses.push([]);

    const { getConversationMembers } = await import("./conversations");
    const result = await getConversationMembers({
      conversationId: "conv-1",
      groupId: "wrong-group",
      userId: "user-1",
    });

    expect(result).toBeNull();
  });

  test("getConversationMembers returns members when conversation belongs to group", async () => {
    selectResponses.push([{ id: "membership-1" }]);
    selectResponses.push([{ id: "conv-1" }]);
    selectResponses.push([
      { id: "user-1", displayName: "Alice", avatarUrl: null, role: "member" },
    ]);

    const { getConversationMembers } = await import("./conversations");
    const result = await getConversationMembers({
      conversationId: "conv-1",
      groupId: "group-1",
      userId: "user-1",
    });

    expect(result).toEqual([
      { id: "user-1", displayName: "Alice", avatarUrl: null, role: "member" },
    ]);
  });

  test("getConversationMembers returns null when caller is not a group member", async () => {
    selectResponses.push([]);

    const { getConversationMembers } = await import("./conversations");
    const result = await getConversationMembers({
      conversationId: "conv-1",
      groupId: "group-1",
      userId: "outsider",
    });

    expect(result).toBeNull();
  });
});
