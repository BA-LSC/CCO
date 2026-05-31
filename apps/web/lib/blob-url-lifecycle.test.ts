import { afterEach, describe, expect, test, vi } from "bun:test";
import {
  deferRevokeBlobUrl,
  resetDeferredBlobRevokesForTests,
} from "@/lib/blob-url-lifecycle";

describe("deferRevokeBlobUrl", () => {
  afterEach(() => {
    resetDeferredBlobRevokesForTests();
  });

  test("ignores non-blob URLs", () => {
    expect(() => deferRevokeBlobUrl("/api/v1/uploads/photo.png")).not.toThrow();
  });

  test("schedules blob revoke without running immediately", () => {
    const revoke = vi.fn();
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = revoke;

    try {
      deferRevokeBlobUrl("blob:preview", 60_000);
      expect(revoke).not.toHaveBeenCalled();
    } finally {
      URL.revokeObjectURL = original;
    }
  });
});
