import { describe, expect, test } from "bun:test";
import {
  isMobileNativeAuthEnabled,
  MOBILE_NATIVE_AUTH_DISABLED_MESSAGE,
} from "./mobile-native-auth";

describe("mobile native auth flag", () => {
  test("is disabled by default", () => {
    const prev = process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
    try {
      delete process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
      expect(isMobileNativeAuthEnabled()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
      else process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED = prev;
    }
  });

  test("enables when CCO_MOBILE_NATIVE_AUTH_ENABLED=1", () => {
    const prev = process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
    try {
      process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED = "1";
      expect(isMobileNativeAuthEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
      else process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED = prev;
    }
  });

  test("exports a stable disabled message", () => {
    expect(MOBILE_NATIVE_AUTH_DISABLED_MESSAGE).toContain("disabled");
  });
});
