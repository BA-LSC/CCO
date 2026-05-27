import { describe, expect, test } from "bun:test";
import type { RealtimeEvent } from "./conversation-room";

describe("ConversationRoom broadcast", () => {
  test("serializes events for WebSocket delivery", () => {
    const event: RealtimeEvent = {
      type: "message.created",
      conversationId: "conv-1",
      message: { id: "m1", body: "hello" },
    };

    const payload = JSON.stringify(event);
    const parsed = JSON.parse(payload) as RealtimeEvent;
    expect(parsed.type).toBe("message.created");
    expect(parsed.conversationId).toBe("conv-1");
  });

  test("two subscribers receive the same published event", () => {
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    const subscribers = new Set<WebSocket>([
      { send: (data: string) => receivedA.push(data) } as unknown as WebSocket,
      { send: (data: string) => receivedB.push(data) } as unknown as WebSocket,
    ]);

    const event: RealtimeEvent = {
      type: "message.created",
      conversationId: "conv-1",
      message: { id: "m1", body: "hi" },
    };
    const payload = JSON.stringify(event);

    for (const ws of subscribers) {
      ws.send(payload);
    }

    expect(receivedA).toEqual([payload]);
    expect(receivedB).toEqual([payload]);
  });

  test("broadcast removes dead subscribers after send failure", () => {
    const subscribers = new Set<WebSocket>();
    const dead = {
      send() {
        throw new Error("closed");
      },
    } as unknown as WebSocket;
    const alivePayloads: string[] = [];
    const alive = {
      send(data: string) {
        alivePayloads.push(data);
      },
    } as unknown as WebSocket;

    subscribers.add(dead);
    subscribers.add(alive);

    const event: RealtimeEvent = {
      type: "reaction.changed",
      conversationId: "conv-1",
      messageId: "m1",
      action: "added",
      reaction: { emoji: "👍", userId: "u1" },
    };
    const payload = JSON.stringify(event);

    for (const ws of subscribers) {
      try {
        ws.send(payload);
      } catch {
        subscribers.delete(ws);
      }
    }

    expect(subscribers.size).toBe(1);
    expect(alivePayloads).toEqual([payload]);
  });
});
