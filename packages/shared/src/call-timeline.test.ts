import { describe, expect, it } from "vitest";
import {
  buildCallTimelineEvents,
  formatCallDuration,
  formatCallTimelineLabel,
} from "./call-timeline";

describe("formatCallDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatCallDuration(45)).toBe("45s");
    expect(formatCallDuration(320)).toBe("5m 20s");
    expect(formatCallDuration(300)).toBe("5m");
    expect(formatCallDuration(3900)).toBe("1h 5m");
  });
});

describe("formatCallTimelineLabel", () => {
  it("labels call timeline events", () => {
    expect(formatCallTimelineLabel({ kind: "started" })).toBe("Call started");
    expect(formatCallTimelineLabel({ kind: "missed" })).toBe("Missed call");
    expect(formatCallTimelineLabel({ kind: "ended", durationSeconds: 320 })).toBe(
      "Call ended • 5m 20s",
    );
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
