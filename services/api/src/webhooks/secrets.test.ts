import { describe, expect, test } from "bun:test";
import { encryptSecret } from "../auth/token-crypto";
import {
  decryptWebhookSecrets,
  encryptWebhookSecrets,
  encryptWebhookSecretsInput,
  parseWebhookSecretsInput,
} from "./secrets";

describe("parseWebhookSecretsInput", () => {
  test("splits on newlines and trims", () => {
    expect(parseWebhookSecretsInput("  aaa  \nbbb\n\nccc  ")).toEqual(["aaa", "bbb", "ccc"]);
  });

  test("dedupes identical secrets", () => {
    expect(parseWebhookSecretsInput("same\nsame\nother")).toEqual(["same", "other"]);
  });
});

describe("encrypt/decrypt webhook secrets", () => {
  test("round-trips multiple secrets as JSON array", () => {
    const enc = encryptWebhookSecrets(["secret-a", "secret-b"]);
    expect(enc).not.toBeNull();
    expect(decryptWebhookSecrets(enc)).toEqual(["secret-a", "secret-b"]);
  });

  test("encryptWebhookSecretsInput parses multi-line input", () => {
    const enc = encryptWebhookSecretsInput("one\ntwo");
    expect(decryptWebhookSecrets(enc)).toEqual(["one", "two"]);
  });

  test("legacy single secret decrypts as one-element array", () => {
    const legacyEnc = encryptSecret("legacy-only");
    expect(decryptWebhookSecrets(legacyEnc)).toEqual(["legacy-only"]);

    const enc = encryptWebhookSecrets(["legacy-only"]);
    expect(decryptWebhookSecrets(enc)).toEqual(["legacy-only"]);
  });
});
