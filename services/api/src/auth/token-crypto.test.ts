import { afterEach, describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "./token-crypto";

describe("encryptSecret production mode", () => {
  const origEnv = process.env.NODE_ENV;
  const origKey = process.env.TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    if (origKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = origKey;
    }
  });

  test("throws when NODE_ENV=production and key missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("secret")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });
});

describe("encryptionKey hex decoding", () => {
  const origKey = process.env.TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (origKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = origKey;
    }
  });

  test("64 hex chars decode as binary key and round-trip", () => {
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const encrypted = encryptSecret("my-secret-token");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptSecret(encrypted)).toBe("my-secret-token");
  });
});
