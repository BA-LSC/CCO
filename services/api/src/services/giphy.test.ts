import { describe, expect, test } from "bun:test";
import { isAllowedGiphyMediaUrl } from "./giphy";

describe("isAllowedGiphyMediaUrl", () => {
  test("allows giphy media hosts", () => {
    expect(
      isAllowedGiphyMediaUrl("https://media1.giphy.com/media/abc123/giphy.gif"),
    ).toBe(true);
    expect(isAllowedGiphyMediaUrl("https://i.giphy.com/media/abc123/giphy.gif")).toBe(true);
  });

  test("rejects non-giphy hosts", () => {
    expect(isAllowedGiphyMediaUrl("https://example.com/evil.gif")).toBe(false);
    expect(isAllowedGiphyMediaUrl("http://media1.giphy.com/media/abc123/giphy.gif")).toBe(false);
  });
});
