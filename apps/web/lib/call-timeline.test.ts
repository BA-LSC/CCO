import { describe, expect, test } from "bun:test";
import { buildThreadTimeline } from "./call-timeline";

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
