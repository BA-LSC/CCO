import { describe, expect, test } from "bun:test";
import { buildMessageNotificationContent, formatNotificationBody } from "./notification-format";

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

  test("buildMessageNotificationContent uses sender name for dm title", () => {
    const content = buildMessageNotificationContent({
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
    expect(content.image).toBe("https://example.com/sam.jpg");
  });

  test("buildMessageNotificationContent uses group title and author in body", () => {
    const content = buildMessageNotificationContent({
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
  });
});
