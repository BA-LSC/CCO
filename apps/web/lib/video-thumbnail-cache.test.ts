import { describe, expect, test } from "bun:test";
import { videoThumbnailCacheKey } from "./video-thumbnail-cache";

describe("videoThumbnailCacheKey", () => {
  test("uses upload filename regardless of signed query params", () => {
    expect(
      videoThumbnailCacheKey("/api/v1/uploads/clip.mp4?sig=aaa&exp=111"),
    ).toBe("clip.mp4");
    expect(
      videoThumbnailCacheKey(
        "https://cco.example.com/api/v1/uploads/clip.mp4?sig=bbb&exp=222",
      ),
    ).toBe("clip.mp4");
  });

  test("falls back to full src when filename cannot be parsed", () => {
    const src = "https://cdn.example.com/video.mp4";
    expect(videoThumbnailCacheKey(src)).toBe(src);
  });
});
