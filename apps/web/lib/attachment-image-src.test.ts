import { afterEach, describe, expect, test, vi, type Mock } from "bun:test";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import {
  fetchUploadImageBlobUrl,
  resetUploadImageBlobCacheForTests,
  uploadImageSrcNeedsCredentialFetch,
} from "@/lib/attachment-image-src";

vi.mock("@/lib/add-to-homescreen", () => ({
  isStandaloneDisplay: vi.fn(() => false),
}));

const mockStandaloneDisplay = isStandaloneDisplay as Mock<() => boolean>;

describe("uploadImageSrcNeedsCredentialFetch", () => {
  afterEach(() => {
    resetUploadImageBlobCacheForTests();
    mockStandaloneDisplay.mockReturnValue(false);
  });

  test("skips blob preview URLs", () => {
    expect(uploadImageSrcNeedsCredentialFetch("blob:preview")).toBe(false);
  });

  test("requires credential fetch for unsigned upload URLs in browser tabs", () => {
    expect(uploadImageSrcNeedsCredentialFetch("/api/v1/uploads/photo.png")).toBe(true);
  });

  test("allows signed upload URLs in browser tabs", () => {
    expect(
      uploadImageSrcNeedsCredentialFetch(
        "/api/v1/uploads/photo.png?sig=deadbeef&exp=9999999999",
      ),
    ).toBe(false);
  });

  test("allows signed upload URLs in standalone PWA without forcing credential fetch", () => {
    mockStandaloneDisplay.mockReturnValue(true);
    expect(
      uploadImageSrcNeedsCredentialFetch(
        "/api/v1/uploads/photo.png?sig=deadbeef&exp=9999999999",
      ),
    ).toBe(false);
  });

  test("requires credential fetch in standalone when signature is missing", () => {
    mockStandaloneDisplay.mockReturnValue(true);
    expect(uploadImageSrcNeedsCredentialFetch("/api/v1/uploads/photo.png")).toBe(true);
  });
});

describe("fetchUploadImageBlobUrl", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    resetUploadImageBlobCacheForTests();
    globalThis.fetch = originalFetch;
  });

  test("returns null for failed fetch responses", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    ) as typeof fetch;

    await expect(
      fetchUploadImageBlobUrl("/api/v1/uploads/photo.png?sig=x&exp=9999999999"),
    ).resolves.toBeNull();
  });

  test("creates blob URLs for successful image responses", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    ) as typeof fetch;

    const blobUrl = await fetchUploadImageBlobUrl("/api/v1/uploads/photo.png");
    expect(blobUrl?.startsWith("blob:")).toBe(true);
  });
});
