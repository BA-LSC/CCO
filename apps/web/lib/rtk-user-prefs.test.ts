import { describe, expect, test } from "bun:test";
import { parseRtkMirrorVideoPref } from "./rtk-user-prefs";

describe("parseRtkMirrorVideoPref", () => {
  test("defaults to true when unset", () => {
    expect(parseRtkMirrorVideoPref(null)).toBe(true);
    expect(parseRtkMirrorVideoPref("{}")).toBe(true);
  });

  test("reads explicit mirror-video preference", () => {
    expect(parseRtkMirrorVideoPref(JSON.stringify({ "mirror-video": "false" }))).toBe(false);
    expect(parseRtkMirrorVideoPref(JSON.stringify({ "mirror-video": "true" }))).toBe(true);
  });
});
