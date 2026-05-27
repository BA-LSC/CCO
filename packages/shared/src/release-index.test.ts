import { describe, expect, test } from "bun:test";
import {
  CCO_RELEASE_INDEX_URL,
  CCO_RELEASES_ORIGIN,
} from "./release-index.js";

describe("release-index", () => {
  test("release index URL is hosted on setup-c.co", () => {
    expect(CCO_RELEASES_ORIGIN).toBe("https://setup-c.co");
    expect(CCO_RELEASE_INDEX_URL).toBe(
      "https://setup-c.co/releases/release-index.json",
    );
  });
});
