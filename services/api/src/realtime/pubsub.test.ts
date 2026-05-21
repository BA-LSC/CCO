import { describe, expect, test } from "bun:test";
import { publishMessageEvent, resetPubSubForTests, subscribeToConversation } from "./pubsub";

describe("publishMessageEvent", () => {
  test("emits message.created to subscribers", async () => {
    resetPubSubForTests();
    const received: string[] = [];
    subscribeToConversation("c1", (event) => {
      received.push(event.type);
    });

    await publishMessageEvent({
      type: "message.created",
      conversationId: "c1",
      message: {
        id: "m1",
        conversationId: "c1",
        authorId: "u1",
        authorName: "Test",
        body: "hi",
        attachmentUrl: null,
        messageType: "text",
        clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    expect(received).toEqual(["message.created"]);
  });
});
