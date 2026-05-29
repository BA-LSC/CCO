import { describe, expect, test } from "bun:test";
import {
  applyCallEndedToTimelineEvents,
  buildThreadTimeline,
  normalizeCallTimelineEvents,
} from "./call-timeline";

describe("applyCallEndedToTimelineEvents", () => {
  test("replaces live started row with missed and regroups consecutive missed calls", () => {
    const callId = "99999999-9999-4999-8999-999999999999";
    const previousMissed = Array.from({ length: 14 }, (_, index) => ({
      id: `call-${index}:missed`,
      callId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: "missed" as const,
      at: new Date(Date.UTC(2026, 4, 28, 17, 0, index)).toISOString(),
    }));

    const withLiveCall = [
      ...previousMissed,
      {
        id: `${callId}:started`,
        callId,
        kind: "started" as const,
        at: "2026-05-28T17:00:14.000Z",
      },
    ];

    const next = applyCallEndedToTimelineEvents(withLiveCall, {
      callId,
      timelineEvent: {
        id: `${callId}:missed`,
        callId,
        kind: "missed",
        at: "2026-05-28T17:00:14.500Z",
      },
    });

    const timeline = buildThreadTimeline([], next);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      kind: "call",
      call: { kind: "missed", missedCount: 15 },
    });
  });
});

describe("normalizeCallTimelineEvents", () => {
  test("removes started rows when a terminal event exists for the call", () => {
    const callId = "11111111-1111-4111-8111-111111111111";
    const normalized = normalizeCallTimelineEvents([
      {
        id: `${callId}:started`,
        callId,
        kind: "started",
        at: "2026-05-28T17:00:00.000Z",
      },
      {
        id: `${callId}:missed`,
        callId,
        kind: "missed",
        at: "2026-05-28T17:00:45.000Z",
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.kind).toBe("missed");
  });
});

describe("buildThreadTimeline", () => {
  test("groups adjacent missed call dividers in the thread", () => {
    const timeline = buildThreadTimeline([], [
      {
        id: "a:missed",
        callId: "11111111-1111-4111-8111-111111111111",
        kind: "missed",
        at: "2026-05-28T17:00:00.000Z",
      },
      {
        id: "b:missed",
        callId: "22222222-2222-4222-8222-222222222222",
        kind: "missed",
        at: "2026-05-28T17:01:00.000Z",
      },
      {
        id: "c:missed",
        callId: "33333333-3333-4333-8333-333333333333",
        kind: "missed",
        at: "2026-05-28T17:02:00.000Z",
      },
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      kind: "call",
      call: { kind: "missed", missedCount: 3 },
    });
  });

  test("does not group missed calls separated by a message", () => {
    const timeline = buildThreadTimeline(
      [
        {
          id: "msg-1",
          createdAt: "2026-05-28T17:01:30.000Z",
        } as never,
      ],
      [
        {
          id: "a:missed",
          callId: "11111111-1111-4111-8111-111111111111",
          kind: "missed",
          at: "2026-05-28T17:00:00.000Z",
        },
        {
          id: "b:missed",
          callId: "22222222-2222-4222-8222-222222222222",
          kind: "missed",
          at: "2026-05-28T17:02:00.000Z",
        },
      ],
    );

    expect(timeline.filter((item) => item.kind === "call")).toHaveLength(2);
  });
});
