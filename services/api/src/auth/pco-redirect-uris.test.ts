import { describe, expect, test } from "bun:test";
import {
  getDefaultPcoApiRedirectUri,
  getDefaultPcoMobileRedirectUri,
  getDefaultPcoWebRedirectUri,
  getDefaultPcoWebhookUrl,
  isAllowedPcoRedirectUri,
} from "./pco-redirect-uris";

describe("pco redirect uris", () => {
  test("allows configured default redirect URIs", async () => {
    const uris = [
      getDefaultPcoWebRedirectUri(),
      getDefaultPcoApiRedirectUri(),
      getDefaultPcoMobileRedirectUri(),
    ];
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
});
