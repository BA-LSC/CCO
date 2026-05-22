import { describe, expect, test } from "bun:test";
import { extractUploadFilename, resolveAttachmentDisplayUrl } from "./attachment-url";

describe("extractUploadFilename", () => {
  test("parses API upload URLs", () => {
    expect(
      extractUploadFilename("https://api.cco.lscavl.dev/uploads/abc.jpeg?sig=deadbeef&exp=999"),
    ).toBe("abc.jpeg");
  });

  test("parses same-origin /api/uploads URLs", () => {
    expect(
      extractUploadFilename("https://cco.lscavl.dev/api/uploads/abc.jpeg?sig=deadbeef&exp=999"),
    ).toBe("abc.jpeg");
  });
});

describe("resolveAttachmentDisplayUrl", () => {
  test("rewrites API upload URLs to same-origin proxy without signed params", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://api.cco.lscavl.dev/uploads/abc.jpeg?sig=deadbeef&exp=999",
      ),
    ).toBe("/api/uploads/abc.jpeg");
  });

  test("rewrites same-origin /api/uploads URLs from PUBLIC_UPLOAD_URL", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://cco.lscavl.dev/api/uploads/abc.jpeg?sig=deadbeef&exp=999",
      ),
    ).toBe("/api/uploads/abc.jpeg");
  });

  test("leaves non-upload URLs unchanged", () => {
    const url = "https://example.com/photo.png";
    expect(resolveAttachmentDisplayUrl(url)).toBe(url);
  });

  test("normalizes already-proxied paths", () => {
    expect(resolveAttachmentDisplayUrl("/api/uploads/abc.jpeg?sig=x")).toBe("/api/uploads/abc.jpeg");
  });
});
