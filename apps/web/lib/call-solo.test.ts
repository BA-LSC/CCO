import { describe, expect, it } from "vitest";
import { isSoloCall } from "./call-solo";

describe("isSoloCall", () => {
  it("is solo when no other participants are joined", () => {
    expect(isSoloCall(0)).toBe(true);
  });

  it("is not solo when one or more others are joined", () => {
    expect(isSoloCall(1)).toBe(false);
    expect(isSoloCall(2)).toBe(false);
  });
});
