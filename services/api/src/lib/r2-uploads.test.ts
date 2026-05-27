import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const ORIGINAL_ENV = { ...process.env };

type MockOrg = {
  cloudflareAccountId: string;
  cloudflareR2BucketName: string;
  cloudflareR2PublicUrl?: string | null;
  cloudflareR2AccessKeyIdEnc?: string | null;
  cloudflareR2SecretAccessKeyEnc?: string | null;
  cloudflareApiTokenEnc?: string | null;
  cloudflareSecretsStoreId?: string | null;
};

let mockOrg: MockOrg | null = null;

mock.module("../services/org-oauth", () => ({
  getConfiguredOrganization: async () => mockOrg,
}));
beforeEach(() => {
  mockOrg = null;
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveR2Config", () => {
  test("reads Secrets Store R2 bindings for configured org buckets", async () => {
    mockOrg = {
      cloudflareAccountId: "acct-123",
      cloudflareR2BucketName: "cco-uploads-acct",
      cloudflareR2PublicUrl: null,
    };
    process.env.R2_ACCESS_KEY_ID = "parent-access-key-id";
    process.env.R2_SECRET_ACCESS_KEY = "parent-secret-key";
    process.env.PUBLIC_UPLOAD_URL = "https://chat.example.com/api/v1/uploads";

    const { resolveR2Config } = await import("./r2-uploads");
    const config = await resolveR2Config();

    expect(config).toEqual({
      accountId: "acct-123",
      bucketName: "cco-uploads-acct",
      accessKeyId: "parent-access-key-id",
      secretAccessKey: "parent-secret-key",
      publicBaseUrl: "https://chat.example.com/api/v1/uploads",
    });
  });

  test("prefers CLOUDFLARE_R2_* env vars on VPS-style deploys", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-1";
    process.env.CLOUDFLARE_R2_BUCKET = "cco-uploads-prod";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "vps-key-id";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "vps-secret";
    process.env.PUBLIC_UPLOAD_URL = "https://api.example.com/uploads";

    const { resolveR2Config } = await import("./r2-uploads");
    const config = await resolveR2Config();

    expect(config).toEqual({
      accountId: "acct-1",
      bucketName: "cco-uploads-prod",
      accessKeyId: "vps-key-id",
      secretAccessKey: "vps-secret",
      publicBaseUrl: "https://api.example.com/uploads",
    });
  });
});
