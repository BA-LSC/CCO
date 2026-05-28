import { describe, expect, test } from "bun:test";
import {
  verifyCloudflareAccountApplyPermissions,
  verifyCloudflareUpdateApplyPermissions,
} from "./update-token-verify";

describe("verifyCloudflareAccountApplyPermissions", () => {
  test("rejects empty token", async () => {
    await expect(
      verifyCloudflareAccountApplyPermissions({
        accountId: "acct",
        apiToken: "",
      }),
    ).rejects.toThrow(/Cloudflare API token is required/);
  });
});

describe("verifyCloudflareUpdateApplyPermissions", () => {
  test("rejects empty token", async () => {
    await expect(
      verifyCloudflareUpdateApplyPermissions({
        accountId: "acct",
        apiToken: "",
        chatHostname: "chat.example.com",
        apiHostname: "api.example.com",
      }),
    ).rejects.toThrow(/Cloudflare API token is required/);
  });
});
