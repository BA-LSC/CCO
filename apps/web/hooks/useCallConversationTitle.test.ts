import { describe, expect, test } from "bun:test";
import { parseCallChatPath } from "./useCallConversationTitle";

describe("parseCallChatPath", () => {
  test("parses DM paths", () => {
    expect(parseCallChatPath("/dms/abc-123")).toEqual({
      kind: "dm",
      conversationId: "abc-123",
    });
    expect(parseCallChatPath("/dms/abc-123/")).toEqual({
      kind: "dm",
      conversationId: "abc-123",
    });
  });

  test("parses group channel paths", () => {
    expect(parseCallChatPath("/groups/g1/c/c1")).toEqual({
      kind: "group",
      groupId: "g1",
      conversationId: "c1",
    });
  });

  test("parses team channel paths", () => {
    expect(parseCallChatPath("/teams/t1/c/c1")).toEqual({
      kind: "team",
      teamId: "t1",
      conversationId: "c1",
    });
  });

  test("returns null for unknown paths", () => {
    expect(parseCallChatPath(null)).toBeNull();
    expect(parseCallChatPath("/settings")).toBeNull();
    expect(parseCallChatPath("/groups/g1")).toBeNull();
  });
});
