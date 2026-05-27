import { describe, expect, test, mock, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ensureOrgUpdateSettingsColumns,
  resolveOrgHostnames,
  resolveUpdatePlatform,
} from "./org-updates";

const ORG_UPDATES_PATH = join(import.meta.dir, "org-updates.ts");

describe("ensureOrgUpdateSettingsColumns", () => {
  afterEach(() => {
    mock.restore();
  });

  test("does not call itself recursively", async () => {
    const source = readFileSync(ORG_UPDATES_PATH, "utf8");
    const fnBody = source.slice(
      source.indexOf("export async function ensureOrgUpdateSettingsColumns"),
      source.indexOf("export type UpdatePlatform"),
    );
    expect(fnBody).toContain("await ensureCloudflareOrganizationColumns()");
    expect(fnBody).not.toMatch(/await ensureOrgUpdateSettingsColumns\(\)/);
  });

  test("delegates to ensureCloudflareOrganizationColumns", async () => {
    let cloudflareEnsureCalls = 0;
    mock.module("./org-schema-capabilities", () => ({
      ensureCloudflareOrganizationColumns: async () => {
        cloudflareEnsureCalls += 1;
      },
    }));

    const { ensureOrgUpdateSettingsColumns: ensureColumns } = await import(
      `./org-updates?t=${Date.now()}`
    );
    await ensureColumns();
    expect(cloudflareEnsureCalls).toBe(1);
  });
});

describe("resolveOrgHostnames", () => {
  test("returns chat and api hostnames from org URLs", () => {
    expect(
      resolveOrgHostnames({
        pcoWebRedirectUri: "https://chat.example.com/auth/callback",
        pcoWebhookUrl: "https://api.example.com/webhooks/pco",
      }),
    ).toEqual({
      chatHostname: "chat.example.com",
      apiHostname: "api.example.com",
    });
  });

  test("returns null when URLs are missing or invalid", () => {
    expect(resolveOrgHostnames({ pcoWebRedirectUri: null, pcoWebhookUrl: null })).toBeNull();
    expect(
      resolveOrgHostnames({
        pcoWebRedirectUri: "not-a-url",
        pcoWebhookUrl: "https://api.example.com/webhooks/pco",
      }),
    ).toBeNull();
  });
});

describe("resolveUpdatePlatform", () => {
  const previousRuntime = process.env.CCO_RUNTIME;
  const previousDeployTarget = process.env.CCO_DEPLOY_TARGET;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (previousRuntime === undefined) delete process.env.CCO_RUNTIME;
    else process.env.CCO_RUNTIME = previousRuntime;
    if (previousDeployTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
    else process.env.CCO_DEPLOY_TARGET = previousDeployTarget;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  test("detects cloudflare when platform is provisioned", () => {
    expect(
      resolveUpdatePlatform({
        cloudflarePlatformProvisionedAt: new Date(),
        cloudflareApiTokenEnc: "enc",
        cloudflareAccountId: "acct",
      }),
    ).toBe("cloudflare");
  });

  test("detects vps when DATABASE_URL is set", () => {
    delete process.env.CCO_RUNTIME;
    delete process.env.CCO_DEPLOY_TARGET;
    process.env.DATABASE_URL = "postgres://localhost/cco";
    expect(
      resolveUpdatePlatform({
        cloudflarePlatformProvisionedAt: null,
        cloudflareApiTokenEnc: null,
        cloudflareAccountId: null,
      }),
    ).toBe("vps");
  });
});
