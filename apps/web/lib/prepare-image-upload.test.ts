import { describe, expect, test } from "bun:test";
import {
  isHeicImageFile,
  resolveBrowserImageMimeType,
} from "@/lib/prepare-image-upload";

describe("isHeicImageFile", () => {
  test("detects HEIC MIME types", () => {
    expect(isHeicImageFile(new File([], "photo", { type: "image/heic" }))).toBe(true);
    expect(isHeicImageFile(new File([], "photo", { type: "image/heif" }))).toBe(true);
  });

  test("detects HEIC file extensions when MIME is missing", () => {
    expect(isHeicImageFile(new File([], "IMG_1234.HEIC", { type: "" }))).toBe(true);
    expect(isHeicImageFile(new File([], "photo.heif", { type: "" }))).toBe(true);
  });

  test("does not flag browser-native image types", () => {
    expect(isHeicImageFile(new File([], "photo.jpg", { type: "image/jpeg" }))).toBe(false);
    expect(isHeicImageFile(new File([], "photo.png", { type: "image/png" }))).toBe(false);
  });
});

describe("resolveBrowserImageMimeType", () => {
  test("accepts canonical browser image MIME types", () => {
    expect(resolveBrowserImageMimeType(new File([], "photo.png", { type: "image/png" }))).toBe(
      "image/png",
    );
  });

  test("normalizes legacy and parameterized PNG MIME types", () => {
    expect(resolveBrowserImageMimeType(new File([], "photo.png", { type: "image/x-png" }))).toBe(
      "image/png",
    );
    expect(
      resolveBrowserImageMimeType(new File([], "photo.png", { type: "image/png; charset=binary" })),
    ).toBe("image/png");
  });

  test("infers PNG from extension when MIME is missing or generic", () => {
    expect(resolveBrowserImageMimeType(new File([], "screenshot.png", { type: "" }))).toBe(
      "image/png",
    );
    expect(
      resolveBrowserImageMimeType(
        new File([], "screenshot.png", { type: "application/octet-stream" }),
      ),
    ).toBe("image/png");
  });

  test("returns null for unsupported types without a known extension", () => {
    expect(resolveBrowserImageMimeType(new File([], "notes.txt", { type: "text/plain" }))).toBe(
      null,
    );
  });
});
