import { describe, expect, test } from "bun:test";
import {
  attachmentCacheKey,
  buildAttachmentDisplaySrcMap,
  extractUploadFilename,
  resolveAttachmentDisplayUrl,
} from "./attachment-url";

describe("extractUploadFilename", () => {
  test("parses API upload URLs", () => {
    expect(
      extractUploadFilename("https://api.example.com/uploads/abc.jpeg?sig=deadbeef&exp=999"),
    ).toBe("abc.jpeg");
  });

  test("parses same-origin /api/v1/uploads URLs", () => {
    expect(
      extractUploadFilename("https://chat.example.com/api/v1/uploads/abc.jpeg?sig=deadbeef&exp=999"),
    ).toBe("abc.jpeg");
  });

  test("parses legacy /api/uploads URLs", () => {
    expect(
      extractUploadFilename("https://chat.example.com/api/uploads/abc.jpeg?sig=deadbeef&exp=999"),
    ).toBe("abc.jpeg");
  });

  test("parses presigned R2 object URLs", () => {
    expect(
      extractUploadFilename(
        "https://2e5c1532f81b48b3a2d2763e11b81ed2.r2.cloudflarestorage.com/cco-uploads-2e5c1532/3c55c577-0a76-4390-9763-57156f.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256",
      ),
    ).toBe("3c55c577-0a76-4390-9763-57156f.jpeg");
  });
});

describe("resolveAttachmentDisplayUrl", () => {
  test("rewrites API upload URLs to same-origin proxy and keeps signed params", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://api.example.com/uploads/abc.jpeg?sig=deadbeef&exp=999",
      ),
    ).toBe("/api/v1/uploads/abc.jpeg?sig=deadbeef&exp=999");
  });

  test("rewrites same-origin /api/uploads URLs from PUBLIC_UPLOAD_URL", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://chat.example.com/api/uploads/abc.jpeg?sig=deadbeef&exp=999",
      ),
    ).toBe("/api/v1/uploads/abc.jpeg?sig=deadbeef&exp=999");
  });

  test("leaves non-upload URLs unchanged", () => {
    const url = "https://example.com/photo.png";
    expect(resolveAttachmentDisplayUrl(url)).toBe(url);
  });

  test("normalizes already-proxied paths and keeps signed params", () => {
    expect(resolveAttachmentDisplayUrl("/api/v1/uploads/abc.jpeg?sig=x&exp=999")).toBe(
      "/api/v1/uploads/abc.jpeg?sig=x&exp=999",
    );
  });

  test("rewrites legacy proxy paths to v1 and keeps signed params", () => {
    expect(resolveAttachmentDisplayUrl("/api/uploads/abc.jpeg?sig=x&exp=999")).toBe(
      "/api/v1/uploads/abc.jpeg?sig=x&exp=999",
    );
  });

  test("returns proxy path without params when signature is absent", () => {
    expect(resolveAttachmentDisplayUrl("/api/v1/uploads/abc.jpeg")).toBe("/api/v1/uploads/abc.jpeg");
  });

  test("rewrites presigned R2 URLs to same-origin proxy paths", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://abc123.r2.cloudflarestorage.com/cco-uploads-test/abc.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256",
      ),
    ).toBe("/api/v1/uploads/abc.jpeg");
  });
});

describe("attachmentCacheKey", () => {
  test("uses upload filename for CCO uploads", () => {
    expect(
      attachmentCacheKey("https://api.example.com/uploads/abc.jpeg?sig=x&exp=1"),
    ).toBe("abc.jpeg");
  });

  test("falls back to full URL for external attachments", () => {
    const url = "https://media.giphy.com/media/abc/giphy.gif";
    expect(attachmentCacheKey(url)).toBe(url);
  });
});

describe("buildAttachmentDisplaySrcMap", () => {
  test("deduplicates upload attachments by filename", () => {
    const map = buildAttachmentDisplaySrcMap([
      "https://api.example.com/uploads/abc.jpeg?sig=old&exp=1",
      "https://api.example.com/uploads/abc.jpeg?sig=new&exp=999",
    ]);

    expect(map.size).toBe(1);
    expect(map.get("abc.jpeg")).toBe("/api/v1/uploads/abc.jpeg?sig=new&exp=999");
  });

  test("keeps distinct external attachment URLs separate", () => {
    const first = "https://media.giphy.com/media/one/giphy.gif";
    const second = "https://media.giphy.com/media/two/giphy.gif";
    const map = buildAttachmentDisplaySrcMap([first, second]);

    expect(map.size).toBe(2);
    expect(map.get(first)).toBe(first);
    expect(map.get(second)).toBe(second);
  });
});
