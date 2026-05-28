import { describe, expect, test } from "bun:test";
import { clampSidebarReveal, resolveSidebarReveal } from "@/lib/pwa-sidebar-swipe";

describe("clampSidebarReveal", () => {
  test("clamps between 0 and sidebar width", () => {
    expect(clampSidebarReveal(-20, 280)).toBe(0);
    expect(clampSidebarReveal(140, 280)).toBe(140);
    expect(clampSidebarReveal(400, 280)).toBe(280);
  });
});

describe("resolveSidebarReveal", () => {
  test("opens when past threshold ratio", () => {
    expect(resolveSidebarReveal(100, 280)).toBe("open");
    expect(resolveSidebarReveal(97, 280)).toBe("closed");
  });

  test("returns closed for invalid width", () => {
    expect(resolveSidebarReveal(100, 0)).toBe("closed");
  });
});
