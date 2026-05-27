import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { encryptSecret } from "../auth/token-crypto";
import {
  collectOrganizationSecretsForStoreMigration,
  organizationHasPendingSecretsStoreMigration,
} from "./org-secrets";

describe("organizationHasPendingSecretsStoreMigration", () => {
  test("returns false when store id is missing", () => {
    expect(
      organizationHasPendingSecretsStoreMigration({
        cloudflareSecretsStoreId: null,
        pcoClientSecretEnc: "enc:v1:abc",
        pcoWebhookSecretEnc: null,
        giphyApiKeyEnc: null,
        vapidPrivateKeyEnc: null,
        cloudflareApiTokenEnc: null,
        cloudflareR2AccessKeyIdEnc: null,
        cloudflareR2SecretAccessKeyEnc: null,
      }),
    ).toBe(false);
  });

  test("returns true when store id is set and D1 still has encrypted org secrets", () => {
    expect(
      organizationHasPendingSecretsStoreMigration({
        cloudflareSecretsStoreId: "store-1",
        pcoClientSecretEnc: "enc:v1:abc",
        pcoWebhookSecretEnc: null,
        giphyApiKeyEnc: null,
        vapidPrivateKeyEnc: null,
        cloudflareApiTokenEnc: null,
        cloudflareR2AccessKeyIdEnc: null,
        cloudflareR2SecretAccessKeyEnc: null,
      }),
    ).toBe(true);
  });

  test("returns false when store id is set and D1 enc columns are cleared", () => {
    expect(
      organizationHasPendingSecretsStoreMigration({
        cloudflareSecretsStoreId: "store-1",
        pcoClientSecretEnc: null,
        pcoWebhookSecretEnc: null,
        giphyApiKeyEnc: null,
        vapidPrivateKeyEnc: null,
        cloudflareApiTokenEnc: null,
        cloudflareR2AccessKeyIdEnc: null,
        cloudflareR2SecretAccessKeyEnc: null,
      }),
    ).toBe(false);
  });
});

describe("collectOrganizationSecretsForStoreMigration", () => {
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = previousKey;
  });

  test("decrypts configured org secrets for store upsert", () => {
    const upserts = collectOrganizationSecretsForStoreMigration({
      cloudflareSecretsStoreId: "store-1",
      pcoClientSecretEnc: encryptSecret("pco-secret"),
      pcoWebhookSecretEnc: null,
      giphyApiKeyEnc: null,
      vapidPrivateKeyEnc: null,
      cloudflareApiTokenEnc: null,
      cloudflareR2AccessKeyIdEnc: null,
      cloudflareR2SecretAccessKeyEnc: null,
    });

    expect(upserts).toEqual([
      { secretName: "cco_pco_client_secret", value: "pco-secret" },
    ]);
  });
});
