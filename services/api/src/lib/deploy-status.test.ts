import { afterEach, describe, expect, mock, test } from "bun:test";

describe("setDeployLastError", () => {
  const previousCfDeployKv = process.env.CF_DEPLOY_KV;

  afterEach(() => {
    mock.restore();
    if (previousCfDeployKv === undefined) delete process.env.CF_DEPLOY_KV;
    else process.env.CF_DEPLOY_KV = previousCfDeployKv;
  });

  test("swallows KV delete failures when clearing error", async () => {
    process.env.CF_DEPLOY_KV = "1";

    mock.module("./cloudflare-kv", () => ({
      kvDeleteBinding: async () => {},
      kvPutBinding: async () => {},
      kvDelete: async () => {
        throw new Error(
          "KV PUT failed: 400 Invalid expiration_ttl of 1. Expiration TTL must be at least 60.",
        );
      },
      kvPut: async () => {},
      kvGet: async () => null,
      kvGetBinding: async () => null,
      resolveDeployKvConfig: async () => ({
        accountId: "acct",
        apiToken: "token",
        namespaceId: "ns",
      }),
    }));

    const { setDeployLastError } = await import(`./deploy-status?t=${Date.now()}`);
    await expect(setDeployLastError(null)).resolves.toBeUndefined();
  });
});
