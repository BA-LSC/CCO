import { describe, expect, test } from "bun:test";
import { resolveAttachmentDisplayUrl } from "./attachment-url";

describe("resolveAttachmentDisplayUrl", () => {
  test("rewrites API upload URLs to same-origin proxy", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://api.cco.lscavl.dev/uploads/abc.jpeg?sig=deadbeef&exp=999",
      ),
    ).toBe("/api/uploads/abc.jpeg?sig=deadbeef&exp=999");
  });

  test("rewrites same-origin /api/uploads URLs from PUBLIC_UPLOAD_URL", () => {
    expect(
      resolveAttachmentDisplayUrl(
        "https://cco.lscavl.dev/api/uploads/abc.jpeg?sig=deadbeef&exp=999",
      ),
    ).toBe("/api/uploads/abc.jpeg?sig=deadbeef&exp=999");
  });

  test("leaves non-upload URLs unchanged", () => {
    const url = "https://example.com/photo.png";
    expect(resolveAttachmentDisplayUrl(url)).toBe(url);
  });

  test("passes through already-proxied paths", () => {
    expect(resolveAttachmentDisplayUrl("/api/uploads/abc.jpeg?sig=x")).toBe(
      "/api/uploads/abc.jpeg?sig=x",
    );
  });
});
