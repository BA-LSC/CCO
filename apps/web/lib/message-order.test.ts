import { describe, expect, test } from "bun:test";
import type { Message } from "@/lib/api";
import { sortMessagesByCreatedAt } from "./message-order";

const base: Message = {
  id: "m1",
  authorName: "Ada",
  body: "hi",
  attachmentUrl: null,
  messageType: "text",
  createdAt: "2026-01-01T12:00:00.000Z",
  reactions: [],
};

describe("sortMessagesByCreatedAt", () => {
  test("orders oldest first", () => {
    const a = { ...base, id: "a", createdAt: "2026-01-01T10:00:00.000Z" };
    const b = { ...base, id: "b", createdAt: "2026-01-01T11:00:00.000Z" };
    const sorted = sortMessagesByCreatedAt([b, a]);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
