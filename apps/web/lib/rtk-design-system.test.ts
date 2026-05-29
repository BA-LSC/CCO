import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readCcoCssColor } from "./rtk-design-system";

const cssVars: Record<string, string> = {};

beforeAll(() => {
  globalThis.window = {} as Window;
  globalThis.document = {
    documentElement: {
      style: {
        setProperty(name: string, value: string) {
          cssVars[name] = value;
        },
        removeProperty(name: string) {
          delete cssVars[name];
        },
      },
    },
  } as Document;
  globalThis.getComputedStyle = (() => ({
    getPropertyValue(name: string) {
      return cssVars[name] ?? "";
    },
  })) as typeof getComputedStyle;
});

afterEach(() => {
  for (const key of Object.keys(cssVars)) {
    delete cssVars[key];
  }
});

afterAll(() => {
  // @ts-expect-error test cleanup
  delete globalThis.window;
  // @ts-expect-error test cleanup
  delete globalThis.document;
  // @ts-expect-error test cleanup
  delete globalThis.getComputedStyle;
});

describe("readCcoCssColor", () => {
  test("reads a CSS variable from document.documentElement", () => {
    document.documentElement.style.setProperty("--color-primary", "#ff5500");
    expect(readCcoCssColor("--color-primary", "#3b9eff")).toBe("#ff5500");
  });

  test("returns fallback when the variable is unset or empty", () => {
    expect(readCcoCssColor("--color-primary", "#3b9eff")).toBe("#3b9eff");
  });

  test("trims whitespace from computed values", () => {
    document.documentElement.style.setProperty("--color-primary", "  #aabbcc  ");
    expect(readCcoCssColor("--color-primary", "#3b9eff")).toBe("#aabbcc");
  });

  test("returns fallback when window is undefined", () => {
    const prevWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    globalThis.window = undefined;
    expect(readCcoCssColor("--color-primary", "#3b9eff")).toBe("#3b9eff");
    globalThis.window = prevWindow;
  });
});
