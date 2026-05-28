import { describe, expect, test } from "bun:test";
import { isUpdateAvailable, releaseShasEqual } from "./org-updates";

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
  test("returns true when live web build lags recorded install", () => {
    expect(
      isUpdateAvailable("0a01b1ae1a44", "cab0bc60abb79956f4576f3cbef714ab3adc039c", [
        "cab0bc60abb79956f4576f3cbef714ab3adc039c",
      ]),
    ).toBe(true);
  });

  test("returns false when all known versions match latest", () => {
    const sha = "cab0bc60abb79956f4576f3cbef714ab3adc039c";
    expect(isUpdateAvailable(sha, sha, [sha])).toBe(false);
  });
});
