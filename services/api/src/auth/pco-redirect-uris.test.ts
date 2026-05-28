import { describe, expect, test } from "bun:test";
import {
  buildInstallSetupUrls,
  deriveApiHostnameFromWeb,
  getDefaultPcoApiRedirectUri,
  getDefaultPcoMobileRedirectUri,
  getDefaultPcoWebRedirectUri,
  getDefaultPcoWebhookUrl,
  isAllowedPcoRedirectUri,
  webhookUrlForApiHostname,
} from "./pco-redirect-uris";

describe("pco redirect uris", () => {
  test("allows configured default redirect URIs", async () => {
    const uris = [getDefaultPcoWebRedirectUri(), getDefaultPcoApiRedirectUri()];
    for (const uri of uris) {
      expect(await isAllowedPcoRedirectUri(uri)).toBe(true);
    }
  });

  test("rejects unknown redirect URI", async () => {
    expect(await isAllowedPcoRedirectUri("https://evil.example/callback")).toBe(false);
  });

  test("webhook URL uses public PCO redirect URI, not internal API_URL", () => {
    const prevRedirect = process.env.PCO_REDIRECT_URI;
    const prevWebhook = process.env.PCO_WEBHOOK_URL;
    const prevApi = process.env.API_URL;
    try {
      process.env.PCO_REDIRECT_URI = "https://api.example.com/auth/pco/callback";
      delete process.env.PCO_WEBHOOK_URL;
      process.env.API_URL = "http://api:3001";
      expect(getDefaultPcoWebhookUrl()).toBe("https://api.example.com/webhooks/pco");
    } finally {
      if (prevRedirect === undefined) delete process.env.PCO_REDIRECT_URI;
      else process.env.PCO_REDIRECT_URI = prevRedirect;
      if (prevWebhook === undefined) delete process.env.PCO_WEBHOOK_URL;
      else process.env.PCO_WEBHOOK_URL = prevWebhook;
      if (prevApi === undefined) delete process.env.API_URL;
      else process.env.API_URL = prevApi;
    }
  });

  test("buildInstallSetupUrls derives chat and api hostnames for BYO install", () => {
    expect(deriveApiHostnameFromWeb("chat.grace.org")).toBe("api.grace.org");
    expect(webhookUrlForApiHostname("api.grace.org")).toBe("https://api.grace.org/webhooks/pco");

    const urls = buildInstallSetupUrls({
      chatHostname: "chat.grace.org",
      apiHostname: "api.grace.org",
    });
    expect(urls.signInRedirectUri).toBe("https://chat.grace.org/api/auth/pco/callback");
    expect(urls.webhookUrl).toBe("https://api.grace.org/webhooks/pco");
    expect(urls.apiRedirectUri).toBe("https://api.grace.org/auth/pco/callback");
    expect(urls.mobileRedirectUri).toBeUndefined();
  });

  test("buildInstallSetupUrls includes mobile redirect when native auth is enabled", () => {
    const prev = process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
    try {
      process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED = "1";
      const urls = buildInstallSetupUrls({
        chatHostname: "chat.grace.org",
        apiHostname: "api.grace.org",
      });
      expect(urls.mobileRedirectUri).toBe("https://api.grace.org/auth/pco/mobile/callback");
    } finally {
      if (prev === undefined) delete process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
      else process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED = prev;
    }
  });

  test("allowed redirect URIs omit mobile callback when native auth is disabled", async () => {
    const prev = process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
    try {
      delete process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
      expect(await isAllowedPcoRedirectUri(getDefaultPcoMobileRedirectUri())).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED;
      else process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED = prev;
    }
  });
});
