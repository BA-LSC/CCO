import { describe, expect, test } from "bun:test";
import { getClientBuildVersion, resolveAppBuildVersion } from "./build-version";

describe("resolveAppBuildVersion", () => {
  test("uses git sha when provided", () => {
    expect(
      resolveAppBuildVersion({
        CCO_BUILD_ID: "abc123",
        NODE_ENV: "production",
      }),
    ).toBe("abc123");
  });

  test("ignores dev placeholder in production", () => {
    const version = resolveAppBuildVersion({
      CCO_BUILD_ID: "dev",
      NODE_ENV: "production",
    });

    expect(version).toMatch(/^build-\d+$/);
  });

  test("returns dev in local development", () => {
    expect(
      resolveAppBuildVersion({
        CCO_BUILD_ID: "dev",
        NODE_ENV: "development",
      }),
    ).toBe("dev");
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
