import { describe, expect, test } from "bun:test";
import type { CallSummaryDto } from "@cco/shared/calls";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { reduceActiveCallsMap } from "./useActiveCallsMap";

const CONV_ID = "11111111-1111-4111-8111-111111111111";
const CALL_ID = "22222222-2222-4222-8222-222222222222";
const HOST_ID = "33333333-3333-4333-8333-333333333333";

function callSummary(participantCount: number): CallSummaryDto {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    hostUserId: HOST_ID,
    hostDisplayName: "Alex Host",
    status: "active",
    participantCount,
    startedAt: "2026-05-29T12:00:00.000Z",
    endedAt: null,
  };
}

function startedEvent(participantCount: number): RealtimeEvent {
  return {
    type: "call.started",
    conversationId: CONV_ID,
    call: callSummary(participantCount),
    timelineEvent: {
      id: "44444444-4444-4444-8444-444444444444",
      callId: CALL_ID,
      kind: "started",
      at: "2026-05-29T12:00:00.000Z",
    },
  };
}

function updatedEvent(participantCount: number): RealtimeEvent {
  return {
    type: "call.updated",
    conversationId: CONV_ID,
    call: callSummary(participantCount),
  };
}

describe("reduceActiveCallsMap", () => {
  test("call.started with participants adds entry", () => {
    const map = reduceActiveCallsMap(new Map(), startedEvent(2));
    expect(map.get(CONV_ID)).toEqual({
      participantCount: 2,
      hostDisplayName: "Alex Host",
    });
  });

  test("call.updated changes participant count", () => {
    let map = reduceActiveCallsMap(new Map(), startedEvent(1));
    map = reduceActiveCallsMap(map, updatedEvent(3));
    expect(map.get(CONV_ID)?.participantCount).toBe(3);
  });

  test("zero participantCount clears entry on started or updated", () => {
    let map = reduceActiveCallsMap(new Map(), startedEvent(2));
    map = reduceActiveCallsMap(map, updatedEvent(0));
    expect(map.has(CONV_ID)).toBe(false);

    map = reduceActiveCallsMap(new Map(), startedEvent(0));
    expect(map.has(CONV_ID)).toBe(false);
  });

  test("call.ended removes entry", () => {
    let map = reduceActiveCallsMap(new Map(), startedEvent(2));
    map = reduceActiveCallsMap(map, {
      type: "call.ended",
      conversationId: CONV_ID,
      callId: CALL_ID,
      timelineEvent: null,
    });
    expect(map.has(CONV_ID)).toBe(false);
  });

  test("ignores unrelated realtime events", () => {
    const initial = reduceActiveCallsMap(new Map(), startedEvent(1));
    const map = reduceActiveCallsMap(initial, {
      type: "typing",
      conversationId: CONV_ID,
      userId: HOST_ID,
      displayName: "Alex",
      isTyping: true,
    });
    expect(map).toBe(initial);
  });
});
