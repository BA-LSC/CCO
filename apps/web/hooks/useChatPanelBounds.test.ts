import { describe, expect, test } from "bun:test";
import { chatPanelPipBounds } from "./useChatPanelBounds";

class MockDOMRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.left = x;
    this.top = y;
    this.width = width;
    this.height = height;
  }

  get bottom() {
    return this.top + this.height;
  }
}

(globalThis as typeof globalThis & { DOMRect: typeof MockDOMRect }).DOMRect =
  MockDOMRect as unknown as typeof DOMRect;

describe("chatPanelPipBounds", () => {
  test("shortens panel bounds to sit above composer", () => {
    const panel = new DOMRect(100, 50, 800, 700);
    const root = {
      querySelector: () => ({
        getBoundingClientRect: () => new DOMRect(120, 680, 760, 92),
      }),
    } as unknown as HTMLElement;

    const bounds = chatPanelPipBounds(panel, root);
    expect(bounds.left).toBe(100);
    expect(bounds.top).toBe(50);
    expect(bounds.width).toBe(800);
    expect(bounds.bottom).toBe(672);
  });

  test("returns original panel when composer is missing", () => {
    const panel = new DOMRect(0, 0, 400, 600);
    const root = {
      querySelector: () => null,
    } as unknown as HTMLElement;

    expect(chatPanelPipBounds(panel, root)).toBe(panel);
  });
});
