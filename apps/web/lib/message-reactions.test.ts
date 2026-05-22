import { describe, expect, test } from "bun:test";
import type { Message, Reaction } from "@/lib/api";
import { applyReactionChange, mergeConversationMessages } from "./message-reactions";

const baseMessage: Message = {
  id: "m1",
  authorName: "Ada",
  body: "hi",
  attachmentUrl: null,
  messageType: "text",
  createdAt: "2026-01-01T12:00:00.000Z",
  reactions: [],
};

const reaction: Reaction = {
  messageId: "m1",
  userId: "u2",
  userName: "Noah",
  emoji: "👍",
};

describe("applyReactionChange", () => {
  test("adds a reaction", () => {
    const next = applyReactionChange([baseMessage], "m1", reaction, "added");
    expect(next[0].reactions).toHaveLength(1);
  });

  test("removes a reaction", () => {
    const withReaction = { ...baseMessage, reactions: [reaction] };
    const next = applyReactionChange([withReaction], "m1", reaction, "removed");
    expect(next[0].reactions).toHaveLength(0);
  });
});

describe("mergeConversationMessages", () => {
  test("updates reactions on existing messages", () => {
    const polled = [{ ...baseMessage, reactions: [reaction] }];
    const next = mergeConversationMessages([baseMessage], polled);
    expect(next[0].reactions).toHaveLength(1);
  });

  test("appends new messages", () => {
    const other: Message = { ...baseMessage, id: "m2", body: "yo" };
    const next = mergeConversationMessages([baseMessage], [baseMessage, other]);
    expect(next).toHaveLength(2);
  });

  test("re-sorts when polled batch is out of order", () => {
    const older: Message = {
      ...baseMessage,
      id: "m1",
      createdAt: "2026-01-01T12:00:00.000Z",
    };
    const newer: Message = {
      ...baseMessage,
      id: "m2",
      createdAt: "2026-01-01T13:00:00.000Z",
    };
    const next = mergeConversationMessages([older], [newer, older]);
    expect(next.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
