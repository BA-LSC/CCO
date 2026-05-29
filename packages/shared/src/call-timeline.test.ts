import { describe, expect, it } from "vitest";
import {
  buildCallTimelineEvents,
  collapseCallTimelineEvents,
  formatCallDuration,
  formatCallLiveDuration,
  formatCallTimelineLabel,
  groupConsecutiveMissedCallEvents,
} from "./call-timeline";

describe("formatCallDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatCallDuration(45)).toBe("45s");
    expect(formatCallDuration(320)).toBe("5m 20s");
    expect(formatCallDuration(300)).toBe("5m");
    expect(formatCallDuration(3900)).toBe("1h 5m");
  });
});

describe("formatCallLiveDuration", () => {
  it("formats live call timers", () => {
    expect(formatCallLiveDuration(45)).toBe("0:45");
    expect(formatCallLiveDuration(320)).toBe("5:20");
    expect(formatCallLiveDuration(3900)).toBe("1:05:00");
  });
});

describe("formatCallTimelineLabel", () => {
  it("labels call timeline events", () => {
    expect(formatCallTimelineLabel({ kind: "started" })).toBe("Call started");
    expect(formatCallTimelineLabel({ kind: "missed" })).toBe("Missed call");
    expect(formatCallTimelineLabel({ kind: "missed", missedCount: 3 })).toBe("3 missed calls");
    expect(formatCallTimelineLabel({ kind: "ended", durationSeconds: 320 })).toBe(
      "Ended call • 5m 20s",
    );
  });
});

describe("groupConsecutiveMissedCallEvents", () => {
  it("groups adjacent missed calls into one row", () => {
    const grouped = groupConsecutiveMissedCallEvents([
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

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      kind: "missed",
      missedCount: 3,
      at: "2026-05-28T17:00:00.000Z",
    });
  });

  it("keeps ended calls between missed groups separate", () => {
    const grouped = groupConsecutiveMissedCallEvents([
      {
        id: "a:missed",
        callId: "11111111-1111-4111-8111-111111111111",
        kind: "missed",
        at: "2026-05-28T17:00:00.000Z",
      },
      {
        id: "b:ended",
        callId: "22222222-2222-4222-8222-222222222222",
        kind: "ended",
        at: "2026-05-28T17:05:00.000Z",
        durationSeconds: 120,
      },
      {
        id: "c:missed",
        callId: "33333333-3333-4333-8333-333333333333",
        kind: "missed",
        at: "2026-05-28T17:10:00.000Z",
      },
    ]);

    expect(grouped).toHaveLength(3);
    expect(grouped[0]?.kind).toBe("missed");
    expect(grouped[0]?.missedCount).toBeUndefined();
    expect(grouped[1]?.kind).toBe("ended");
    expect(grouped[2]?.kind).toBe("missed");
  });
});

describe("collapseCallTimelineEvents", () => {
  it("merges started and terminal events into one row at start time", () => {
    const callId = "11111111-1111-4111-8111-111111111111";
    const collapsed = collapseCallTimelineEvents([
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
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      kind: "missed",
      at: "2026-05-28T17:00:00.000Z",
    });
  });
});

describe("buildCallTimelineEvents", () => {
  it("builds started and ended events when two people joined", () => {
    const events = buildCallTimelineEvents({
      callId: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-05-28T17:00:00.000Z",
      endedAt: "2026-05-28T17:05:20.000Z",
      joinedParticipantCount: 2,
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("started");
    expect(events[1]).toMatchObject({ kind: "ended", durationSeconds: 320 });
  });

  it("builds missed call when only host joined", () => {
    const events = buildCallTimelineEvents({
      callId: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-05-28T17:00:00.000Z",
      endedAt: "2026-05-28T17:00:45.000Z",
      joinedParticipantCount: 1,
    });
    expect(events).toHaveLength(2);
    expect(events[1]?.kind).toBe("missed");
  });
});
