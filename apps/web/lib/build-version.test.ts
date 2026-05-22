import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearBuildVersionCacheForTests,
  getClientBuildVersion,
  resolveAppBuildVersion,
} from "./build-version";

function withCleanBuildIdCwd(run: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), "cco-build-"));
  const prev = process.cwd();
  clearBuildVersionCacheForTests();
  process.chdir(dir);
  try {
    run();
  } finally {
    process.chdir(prev);
    clearBuildVersionCacheForTests();
  }
}

describe("resolveAppBuildVersion", () => {
  test("uses git sha when provided", () => {
    withCleanBuildIdCwd(() => {
      expect(
        resolveAppBuildVersion({
          CCO_BUILD_ID: "abc123",
          NODE_ENV: "production",
        }),
      ).toBe("abc123");
    });
  });

  test("treats dev placeholder as dev in production", () => {
    withCleanBuildIdCwd(() => {
      expect(
        resolveAppBuildVersion({
          CCO_BUILD_ID: "dev",
          NODE_ENV: "production",
        }),
      ).toBe("dev");
    });
  });

  test("returns dev in local development", () => {
    withCleanBuildIdCwd(() => {
      expect(
        resolveAppBuildVersion({
          CCO_BUILD_ID: "dev",
          NODE_ENV: "development",
        }),
      ).toBe("dev");
    });
  });

  test("prefers baked BUILD_ID file over env", () => {
    const dir = mkdtempSync(join(tmpdir(), "cco-build-"));
    Bun.write(join(dir, "BUILD_ID"), "file-sha\n");
    const prev = process.cwd();
    clearBuildVersionCacheForTests();
    process.chdir(dir);
    try {
      expect(
        resolveAppBuildVersion({
          CCO_BUILD_ID: "env-sha",
          NODE_ENV: "production",
        }),
      ).toBe("file-sha");
    } finally {
      process.chdir(prev);
      clearBuildVersionCacheForTests();
    }
  });

  test("getClientBuildVersion prefers the SSR meta tag", () => {
    const meta = { getAttribute: () => "server-version" };
    const querySelector = () => meta;
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { querySelector },
    });

    expect(getClientBuildVersion("bundle-version")).toBe("server-version");

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });
});
