import { describe, expect, test, afterEach } from "bun:test";
import {
  orgMatchesDeploymentHostnames,
  pickConfiguredOrganizationRow,
  resolveDeploymentHostnames,
} from "./configured-org-query";
import type { ConfiguredOrganizationRow } from "./org-select";

function org(partial: Partial<ConfiguredOrganizationRow>): ConfiguredOrganizationRow {
  return {
    id: partial.id ?? "id",
    name: partial.name ?? "Church",
    pcoOrganizationId: partial.pcoOrganizationId ?? "101911",
    churchCenterSubdomain: null,
    pcoClientId: "client",
    pcoClientSecretEnc: null,
    pcoWebhookSecretEnc: null,
    pcoWebRedirectUri: partial.pcoWebRedirectUri ?? "https://cco.example.com/api/auth/pco/callback",
    pcoWebhookUrl: partial.pcoWebhookUrl ?? "https://api.example.com/webhooks/pco",
    pcoOauthScope: "people groups services",
    setupCompletedAt: partial.setupCompletedAt ?? new Date(),
    setupByUserId: null,
    setupSessionTokenHash: null,
    vapidPublicKey: null,
    vapidPrivateKeyEnc: null,
    vapidSubject: null,
    giphyApiKeyEnc: null,
    createdAt: new Date(),
    cloudflareAccountId: null,
    realtimeKitAppId: null,
    cloudflareApiTokenEnc: null,
    realtimeKitPresetHost: null,
    realtimeKitPresetMember: null,
    realtimeKitPresetGuest: null,
    pcoLastSyncedAt: null,
    pcoNightlySyncEnabled: true,
    cloudflareR2BucketName: null,
    cloudflareKvPresenceNamespaceId: null,
    cloudflareKvDeployNamespaceId: null,
    cloudflarePushQueueId: null,
    cloudflareSecretsStoreId: null,
    pcoClientSecretConfigured: true,
    pcoWebhookSecretsConfigured: true,
    giphyApiKeyConfigured: false,
    vapidPrivateKeyConfigured: false,
    cloudflareApiTokenConfigured: false,
    cloudflarePlatformProvisionedAt: null,
    installedReleaseVersion: partial.installedReleaseVersion ?? null,
    autoUpdateEnabled: false,
    autoUpdateCheckIntervalMinutes: 360,
    lastUpdateCheckAt: partial.lastUpdateCheckAt ?? null,
    gitRepoUrl: null,
  };
}

describe("resolveDeploymentHostnames", () => {
  const prevApi = process.env.API_DOMAIN;
  const prevWeb = process.env.WEB_URL;

  afterEach(() => {
    if (prevApi === undefined) delete process.env.API_DOMAIN;
    else process.env.API_DOMAIN = prevApi;
    if (prevWeb === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = prevWeb;
  });

  test("reads API_DOMAIN and WEB_URL bindings", () => {
    process.env.API_DOMAIN = "api.lscavl.dev";
    process.env.WEB_URL = "https://cco.lscavl.dev";
    expect(resolveDeploymentHostnames()).toEqual({
      apiHost: "api.lscavl.dev",
      chatHost: "cco.lscavl.dev",
    });
  });
});

describe("pickConfiguredOrganizationRow", () => {
  const prevApi = process.env.API_DOMAIN;
  const prevWeb = process.env.WEB_URL;

  afterEach(() => {
    if (prevApi === undefined) delete process.env.API_DOMAIN;
    else process.env.API_DOMAIN = prevApi;
    if (prevWeb === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = prevWeb;
  });

  test("prefers established org over provision handoff duplicate", () => {
    process.env.API_DOMAIN = "api.lscavl.dev";
    process.env.WEB_URL = "https://cco.lscavl.dev";

    const established = org({
      id: "lake",
      name: "Lake Sawyer Church",
      pcoOrganizationId: "101911",
      pcoWebRedirectUri: "https://cco.lscavl.dev/auth/pco/callback",
      pcoWebhookUrl: "https://api.lscavl.dev/webhooks/pco",
      installedReleaseVersion: "06829284d683e7b0803da742ea2dab827aec8255",
      setupCompletedAt: new Date("2026-01-01"),
    });
    const handoffDuplicate = org({
      id: "cco",
      name: "CCO Church",
      pcoOrganizationId: "",
      pcoWebRedirectUri: "https://cco.lscavl.dev/api/auth/pco/callback",
      pcoWebhookUrl: "https://api.lscavl.dev/webhooks/pco",
      installedReleaseVersion: "b0f36305cdcd06c9036d65f08147605452303353",
      setupCompletedAt: null,
      pcoClientId: null,
      pcoClientSecretConfigured: false,
      pcoWebhookSecretsConfigured: false,
    });

    expect(pickConfiguredOrganizationRow([handoffDuplicate, established])).toEqual(established);
  });

  test("prefers org with real PCO id when hostnames do not match", () => {
    delete process.env.API_DOMAIN;
    delete process.env.WEB_URL;

    const withPco = org({ id: "lake", pcoOrganizationId: "101911" });
    const orphan = org({ id: "cco", pcoOrganizationId: "pending-abc" });

    expect(pickConfiguredOrganizationRow([orphan, withPco])).toEqual(withPco);
  });
});
