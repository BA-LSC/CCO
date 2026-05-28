import { describe, expect, test } from "bun:test";
import type { Reaction } from "@/lib/api";
import {
  appendNewEmojisToDisplayOrder,
  buildDisplayOrderFromGrouped,
  buildEnterDelayByEmoji,
  buildReactionPillRenders,
  findAddedEmojiTypes,
  findRemovedEmojiGroups,
  groupReactionsByEmoji,
} from "./message-reaction-pills";

const reaction = (emoji: string, userId = "u1"): Reaction => ({
  messageId: "m1",
  userId,
  userName: "Ada",
  emoji,
});

describe("groupReactionsByEmoji", () => {
  test("preserves first-seen emoji order from the reactions array", () => {
    const grouped = groupReactionsByEmoji([
      reaction("👍"),
      reaction("❤️"),
      reaction("👍", "u2"),
    ]);
    expect(grouped.map(([emoji]) => emoji)).toEqual(["👍", "❤️"]);
  });
});

describe("appendNewEmojisToDisplayOrder", () => {
  test("appends on other messages without reordering existing pills", () => {
    const next = appendNewEmojisToDisplayOrder(["👍", "❤️"], ["🎉"], "other");
    expect(next).toEqual(["👍", "❤️", "🎉"]);
  });

  test("prepends on own messages without reordering existing pills", () => {
    const next = appendNewEmojisToDisplayOrder(["❤️", "👍"], ["🎉"], "own");
    expect(next).toEqual(["🎉", "❤️", "👍"]);
  });

  test("ignores server reordering when emoji set is unchanged", () => {
    const serverGrouped = groupReactionsByEmoji([reaction("❤️"), reaction("👍")]);
    const displayOrder = buildDisplayOrderFromGrouped(
      groupReactionsByEmoji([reaction("👍"), reaction("❤️")]),
      "other",
    );
    const next = appendNewEmojisToDisplayOrder(displayOrder, serverGrouped.map(([emoji]) => emoji), "other");
    expect(next).toEqual(["👍", "❤️"]);
  });
});

describe("findAddedEmojiTypes", () => {
  test("detects new emoji types between commits", () => {
    const prev = groupReactionsByEmoji([reaction("👍")]);
    const next = groupReactionsByEmoji([reaction("👍"), reaction("❤️")]);
    expect(findAddedEmojiTypes(prev, next)).toEqual(["❤️"]);
  });
});

describe("findRemovedEmojiGroups", () => {
  test("detects removed emoji types between commits", () => {
    const prev = groupReactionsByEmoji([reaction("👍"), reaction("❤️")]);
    const next = groupReactionsByEmoji([reaction("👍")]);
    expect(findRemovedEmojiGroups(prev, next).map(([emoji]) => emoji)).toEqual(["❤️"]);
  });
});

describe("buildReactionPillRenders", () => {
  test("keeps stable display order when counts change", () => {
    const grouped = groupReactionsByEmoji([reaction("👍"), reaction("❤️"), reaction("👍", "u2")]);
    const pills = buildReactionPillRenders({
      grouped,
      displayOrder: ["👍", "❤️"],
      enteringEmojis: new Set(),
      exitingEmojis: [],
      enterDelayByEmoji: new Map(),
    });
    expect(pills.map((pill) => pill.emoji)).toEqual(["👍", "❤️"]);
    expect(pills[0]?.list).toHaveLength(2);
  });

  test("marks newly added emoji types as entering", () => {
    const grouped = groupReactionsByEmoji([reaction("👍"), reaction("❤️")]);
    const pills = buildReactionPillRenders({
      grouped,
      displayOrder: ["👍", "❤️"],
      enteringEmojis: new Set(["❤️"]),
      exitingEmojis: [],
      enterDelayByEmoji: buildEnterDelayByEmoji(new Set(["❤️"]), ["👍", "❤️"], "other"),
    });
    expect(pills.find((pill) => pill.emoji === "❤️")?.phase).toBe("enter");
    expect(pills.find((pill) => pill.emoji === "👍")?.phase).toBe("steady");
  });
});
