import { describe, expect, test } from "bun:test";
import { getMessageLayoutInfo } from "./message-grouping";

const userA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function msg(authorId: string, createdAt: string) {
  return { authorId, createdAt };
}

describe("getMessageLayoutInfo", () => {
  test("groups own messages within five minutes without timestamps", () => {
    const messages = [
      msg(userA, "2026-01-01T17:00:00.000Z"),
      msg(userA, "2026-01-01T17:04:00.000Z"),
    ];

    expect(getMessageLayoutInfo(messages, 0, userA)).toMatchObject({
      groupPosition: "first",
      spacing: "medium",
      clusterTimestamp: false,
    });
    expect(getMessageLayoutInfo(messages, 1, userA)).toMatchObject({
      groupPosition: "last",
      spacing: "tight",
      clusterTimestamp: false,
    });
  });

  test("connects stacked messages within five minutes", () => {
    const messages = [
      msg(userA, "2026-01-01T17:08:00.000Z"),
      msg(userA, "2026-01-01T17:09:00.000Z"),
      msg(userA, "2026-01-01T17:09:30.000Z"),
    ];

    expect(getMessageLayoutInfo(messages, 0, userA)).toMatchObject({
      groupPosition: "first",
      clusterTimestamp: false,
    });
    expect(getMessageLayoutInfo(messages, 1, userA)).toMatchObject({
      groupPosition: "middle",
      clusterTimestamp: false,
    });
    expect(getMessageLayoutInfo(messages, 2, userA)).toMatchObject({
      groupPosition: "last",
      clusterTimestamp: false,
    });
  });

  test("shows a timestamp only on the message after a five minute gap", () => {
    const messages = [
      msg(userA, "2026-01-01T17:00:00.000Z"),
      msg(userA, "2026-01-01T17:10:00.000Z"),
    ];

    expect(getMessageLayoutInfo(messages, 0, userA)).toMatchObject({
      groupPosition: "single",
      clusterTimestamp: false,
      nextHasGapBreak: true,
    });
    expect(getMessageLayoutInfo(messages, 1, userA)).toMatchObject({
      spacing: "medium",
      groupPosition: "single",
      clusterTimestamp: true,
      showTimestamp: true,
    });
  });

  test("shows the timestamp on the next message after a grouped cluster", () => {
    const messages = [
      msg(userA, "2026-01-01T17:00:00.000Z"),
      msg(userA, "2026-01-01T17:04:00.000Z"),
      msg(userA, "2026-01-01T17:15:00.000Z"),
    ];

    expect(getMessageLayoutInfo(messages, 0, userA)).toMatchObject({
      groupPosition: "first",
      clusterTimestamp: false,
    });
    expect(getMessageLayoutInfo(messages, 1, userA)).toMatchObject({
      groupPosition: "last",
      clusterTimestamp: false,
      nextHasGapBreak: true,
    });
    expect(getMessageLayoutInfo(messages, 2, userA)).toMatchObject({
      groupPosition: "single",
      spacing: "medium",
      clusterTimestamp: true,
    });
  });

  test("breaks groups when another user replies", () => {
    const messages = [
      msg(userA, "2026-01-01T17:00:00.000Z"),
      msg(userB, "2026-01-01T17:01:00.000Z"),
      msg(userA, "2026-01-01T17:02:00.000Z"),
    ];

    expect(getMessageLayoutInfo(messages, 1, userA)).toMatchObject({
      showAuthorName: true,
      showAvatar: true,
      groupPosition: "single",
    });
    expect(getMessageLayoutInfo(messages, 2, userA)).toMatchObject({
      groupPosition: "single",
      spacing: "medium",
    });
  });
});
