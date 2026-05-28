import { describe, expect, test } from "bun:test";
import { isHeicImageFile } from "@/lib/prepare-image-upload";

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
