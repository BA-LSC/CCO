import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { encryptSecret } from "../auth/token-crypto";
import {
  collectOrganizationSecretsForStoreMigration,
  organizationHasPendingSecretsStoreMigration,
  resolveOrgSecretsStoreContext,
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

describe("resolveOrgSecretsStoreContext", () => {
  const baseOrg = {
    cloudflareSecretsStoreId: "store-1",
    cloudflareAccountId: "acct-1",
  };

  test("returns null when Secrets Store is not configured", async () => {
    expect(
      await resolveOrgSecretsStoreContext({
        cloudflareSecretsStoreId: null,
        cloudflareAccountId: "acct-1",
      } as never),
    ).toBeNull();
  });

  test("prefers explicit apiToken over process.env", async () => {
    const previous = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = "env-token";
    try {
      const ctx = await resolveOrgSecretsStoreContext(baseOrg as never, "admin-token");
      expect(ctx).toEqual({
        accountId: "acct-1",
        storeId: "store-1",
        apiToken: "admin-token",
      });
    } finally {
      if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = previous;
    }
  });

  test("falls back to process.env when apiToken is omitted", async () => {
    const previous = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = "env-token";
    try {
      const ctx = await resolveOrgSecretsStoreContext(baseOrg as never);
      expect(ctx?.apiToken).toBe("env-token");
    } finally {
      if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = previous;
    }
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
