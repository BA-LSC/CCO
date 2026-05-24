import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getClientBuildVersion, resolveAppBuildVersionFromEnv } from "./build-version";
import {
  clearBuildVersionCacheForTests,
  resolveAppBuildVersion,
} from "./build-version.server";

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

describe("resolveAppBuildVersionFromEnv", () => {
  test("uses git sha when provided", () => {
    expect(
      resolveAppBuildVersionFromEnv({
        CCO_BUILD_ID: "abc123",
        NODE_ENV: "production",
      }),
    ).toBe("abc123");
  });

  test("treats dev placeholder as dev in production", () => {
    expect(
      resolveAppBuildVersionFromEnv({
        CCO_BUILD_ID: "dev",
        NODE_ENV: "production",
      }),
    ).toBe("dev");
  });

  test("returns dev in local development", () => {
    expect(
      resolveAppBuildVersionFromEnv({
        CCO_BUILD_ID: "dev",
        NODE_ENV: "development",
      }),
    ).toBe("dev");
  });
});

describe("resolveAppBuildVersion", () => {
  test("uses env when no BUILD_ID file exists", () => {
    withCleanBuildIdCwd(() => {
      expect(
        resolveAppBuildVersion({
          CCO_BUILD_ID: "abc123",
          NODE_ENV: "production",
        }),
      ).toBe("abc123");
    });
  });

  test("prefers env deploy id over baked BUILD_ID file", () => {
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
      ).toBe("env-sha");
    } finally {
      process.chdir(prev);
      clearBuildVersionCacheForTests();
    }
  });

  test("falls back to baked BUILD_ID when env is dev", () => {
    const dir = mkdtempSync(join(tmpdir(), "cco-build-"));
    Bun.write(join(dir, "BUILD_ID"), "file-sha\n");
    const prev = process.cwd();
    clearBuildVersionCacheForTests();
    process.chdir(dir);
    try {
      expect(
        resolveAppBuildVersion({
          CCO_BUILD_ID: "dev",
          NODE_ENV: "development",
        }),
      ).toBe("file-sha");
    } finally {
      process.chdir(prev);
      clearBuildVersionCacheForTests();
    }
  });
});

describe("getClientBuildVersion", () => {
  test("uses meta tag fallback when bundle is dev", () => {
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
