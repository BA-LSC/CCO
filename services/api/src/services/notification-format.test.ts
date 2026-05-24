import { describe, expect, test } from "bun:test";
import {
  buildMessageNotificationContent,
  formatNotificationBody,
  resolveNotificationImageUrl,
} from "./notification-format";

describe("notification format", () => {
  test("formatNotificationBody wraps long text to two lines", () => {
    const body = formatNotificationBody(
      "This is a longer message that should wrap across two notification lines when it exceeds the line length limit.",
      2,
      40,
    );
    expect(body.split("\n").length).toBeLessThanOrEqual(2);
    expect(body.endsWith("…")).toBe(true);
  });

  test("resolveNotificationImageUrl accepts https urls only when absolute", () => {
    expect(resolveNotificationImageUrl("https://example.com/sam.jpg")).toBe(
      "https://example.com/sam.jpg",
    );
    expect(resolveNotificationImageUrl("/avatars/sam.jpg")).toBe(
      "http://localhost:3000/avatars/sam.jpg",
    );
    expect(resolveNotificationImageUrl("")).toBeNull();
  });

  test("buildMessageNotificationContent uses sender name for dm title", async () => {
    const content = await buildMessageNotificationContent({
      message: {
        id: "msg-1",
        conversationId: "conv-1",
        authorId: "user-1",
        authorName: "Sam McDonald",
        authorAvatarUrl: "https://example.com/sam.jpg",
        body: "Hello there",
        attachmentUrl: null,
        messageType: "text",
        clientMessageId: "client-1",
        editedAt: null,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      meta: { url: "/dms/conv-1", title: "Message", kind: "dm" },
    });

    expect(content.title).toBe("Sam McDonald");
    expect(content.body).toBe("Hello there");
    expect(content.icon).toBe("https://example.com/sam.jpg");
    expect(content.image).toBeNull();
  });

  test("buildMessageNotificationContent renders mention tokens in body", async () => {
    const content = await buildMessageNotificationContent({
      message: {
        id: "msg-1",
        conversationId: "conv-1",
        authorId: "user-1",
        authorName: "Sam McDonald",
        authorAvatarUrl: null,
        body: "Hey @[Alex](550e8400-e29b-41d4-a716-446655440000) check this",
        attachmentUrl: null,
        messageType: "text",
        clientMessageId: "client-1",
        editedAt: null,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      meta: { url: "/groups/g1/c/conv-1", title: "Small Group", kind: "group" },
    });

    expect(content.body).toBe("Sam McDonald: Hey @Alex check this");
  });

  test("buildMessageNotificationContent uses group title and author in body", async () => {
    const content = await buildMessageNotificationContent({
      message: {
        id: "msg-1",
        conversationId: "conv-1",
        authorId: "user-1",
        authorName: "Sam McDonald",
        authorAvatarUrl: null,
        body: "Team meeting tonight",
        attachmentUrl: null,
        messageType: "text",
        clientMessageId: "client-1",
        editedAt: null,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      meta: { url: "/teams/team-1", title: "Worship", kind: "team" },
    });

    expect(content.title).toBe("Worship");
    expect(content.body).toBe("Sam McDonald: Team meeting tonight");
    expect(content.icon).toBeNull();
    expect(content.image).toBeNull();
  });
});
