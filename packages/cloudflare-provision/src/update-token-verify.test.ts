import { describe, expect, test } from "bun:test";
import { verifyCloudflareUpdateApplyPermissions } from "./update-token-verify";

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
