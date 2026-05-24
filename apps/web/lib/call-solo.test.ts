import { describe, expect, it } from "vitest";
import {
  isSoloCallRoom,
  isSoloCallSession,
  shouldApplySoloCallBehavior,
} from "./call-solo";

describe("isSoloCallRoom", () => {
  it("is solo when no other participants are joined in RealtimeKit", () => {
    expect(isSoloCallRoom(0)).toBe(true);
  });

  it("is not solo when others are joined in RealtimeKit", () => {
    expect(isSoloCallRoom(1)).toBe(false);
  });
});

describe("isSoloCallSession", () => {
  it("treats one active CCO participant as solo", () => {
    expect(isSoloCallSession(1)).toBe(true);
  });

  it("treats two or more active CCO participants as not solo", () => {
    expect(isSoloCallSession(2)).toBe(false);
  });
});

describe("shouldApplySoloCallBehavior", () => {
  it("allows solo behavior when alone in both CCO and RealtimeKit", () => {
    expect(shouldApplySoloCallBehavior(1, 0)).toBe(true);
  });

  it("blocks solo behavior when CCO reports another participant", () => {
    expect(shouldApplySoloCallBehavior(2, 0)).toBe(false);
  });

  it("blocks solo behavior when RealtimeKit reports another participant", () => {
    expect(shouldApplySoloCallBehavior(1, 1)).toBe(false);
  });

  it("blocks solo behavior after another participant joined in the room", () => {
    expect(shouldApplySoloCallBehavior(1, 0, true)).toBe(false);
  });
});
