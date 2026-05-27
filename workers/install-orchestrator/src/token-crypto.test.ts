import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "./token-crypto";

describe("install token-crypto", () => {
  const key = "01234567890123456789012345678901";

  test("round-trips encrypted secrets", async () => {
    const encrypted = await encryptSecret("cf-api-token-secret", key);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(await decryptSecret(encrypted, key)).toBe("cf-api-token-secret");
  });

  test("returns plaintext when encryption key is empty", async () => {
    expect(await encryptSecret("plain", "")).toBe("plain");
    expect(await decryptSecret("plain", "")).toBe("plain");
  });
});
