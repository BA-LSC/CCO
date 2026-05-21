import { describe, expect, test } from "bun:test";
import {
  getDefaultPcoApiRedirectUri,
  getDefaultPcoMobileRedirectUri,
  getDefaultPcoWebRedirectUri,
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
});
