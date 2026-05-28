import { describe, expect, test } from "bun:test";
import {
  formatReleaseShaPair,
  isUpdateAvailable,
  releaseShasEqual,
} from "./release-version.js";

describe("releaseShasEqual", () => {
  test("matches full and short SHAs for the same commit", () => {
    expect(
      releaseShasEqual(
        "0a01b1ae1a44f2c8b2e3d4a5b6c7d8e9f0a1b2c3",
        "0a01b1ae1a44",
      ),
    ).toBe(true);
  });

  test("does not match different commits with a shared prefix", () => {
    expect(releaseShasEqual("0a01b1ae1a44", "0a01b1bff999")).toBe(false);
  });
});

describe("isUpdateAvailable", () => {
  test("returns true when current is behind latest", () => {
    expect(
      isUpdateAvailable(
        "0a01b1ae1a44",
        "cab0bc60abb79956f4576f3cbef714ab3adc039c",
      ),
    ).toBe(true);
  });

  test("returns false when full and short SHAs match latest", () => {
    const sha = "cab0bc60abb79956f4576f3cbef714ab3adc039c";
    expect(isUpdateAvailable(sha, "cab0bc60abb7")).toBe(false);
  });
});

describe("formatReleaseShaPair", () => {
  test("widens labels when 12-char prefixes collide", () => {
    const installed = "cd6dfe6124215d3be4a744f6c2f60ff40fd98b3c";
    const latest = "cd6dfe6124215d3be4a744f6c2f60ff40fd98b3d";
    expect(formatReleaseShaPair(installed, latest)).toEqual({
      installed: "cd6dfe612421…8b3c",
      latest: "cd6dfe612421…8b3d",
    });
  });
});
