import { describe, expect, test } from "bun:test";
import {
  maxScrollTop,
  scrollContainerToElement,
  scrollMessagesToBottom,
} from "./chat-scroll";

describe("chat-scroll", () => {
  test("maxScrollTop is scrollHeight minus clientHeight", () => {
    const el = {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 0,
    } as HTMLElement;

    expect(maxScrollTop(el)).toBe(600);
  });

  test("scrollMessagesToBottom sets scrollTop to max", () => {
    const el = {
      scrollHeight: 500,
      clientHeight: 200,
      scrollTop: 0,
    } as HTMLElement;

    scrollMessagesToBottom(el);
    expect(el.scrollTop).toBe(300);
  });

  test("scrollContainerToElement offsets target below container top", () => {
    const container = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 100 }),
    } as HTMLElement;
    const target = {
      getBoundingClientRect: () => ({ top: 420 }),
    } as HTMLElement;

    scrollContainerToElement(container, target, 24);
    expect(container.scrollTop).toBe(296);
  });
});
