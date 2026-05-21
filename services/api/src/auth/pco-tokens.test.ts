import { describe, expect, test } from "bun:test";
import { encryptSecret } from "./token-crypto";

describe("savePcoTokens encryption", () => {
  test("conflict update values use encryptSecret", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

    const accessToken = encryptSecret("at2");
    const refreshToken = encryptSecret("rt2");

    expect(accessToken).toMatch(/^enc:v1:/);
    expect(refreshToken).toMatch(/^enc:v1:/);
    expect(accessToken).not.toBe("at2");
    expect(refreshToken).not.toBe("rt2");
  });
});
