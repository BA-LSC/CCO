import { describe, expect, test } from "bun:test";
import { getServerApiOrigin } from "./api-origin";

describe("getServerApiOrigin", () => {
  test("prefers public API_URL over docker internal hostname on Cloudflare deploy", () => {
    const prevTarget = process.env.CCO_DEPLOY_TARGET;
    const prevApi = process.env.API_URL;
    const prevDomain = process.env.API_DOMAIN;
    const prevWeb = process.env.WEB_URL;
    process.env.CCO_DEPLOY_TARGET = "cloudflare";
    process.env.API_URL = "http://api:3001";
    process.env.API_DOMAIN = "api.example.com";
    delete process.env.WEB_URL;
    try {
      expect(getServerApiOrigin()).toBe("https://api.example.com");
    } finally {
      if (prevTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prevTarget;
      if (prevApi === undefined) delete process.env.API_URL;
      else process.env.API_URL = prevApi;
      if (prevDomain === undefined) delete process.env.API_DOMAIN;
      else process.env.API_DOMAIN = prevDomain;
      if (prevWeb === undefined) delete process.env.WEB_URL;
      else process.env.WEB_URL = prevWeb;
    }
  });

  test("derives api host from WEB_URL when API_DOMAIN unset", () => {
    const prevApi = process.env.API_URL;
    const prevDomain = process.env.API_DOMAIN;
    const prevWeb = process.env.WEB_URL;
    delete process.env.API_URL;
    delete process.env.API_DOMAIN;
    process.env.WEB_URL = "https://chat.example.com";
    try {
      expect(getServerApiOrigin()).toBe("https://api.example.com");
    } finally {
      if (prevApi === undefined) delete process.env.API_URL;
      else process.env.API_URL = prevApi;
      if (prevDomain === undefined) delete process.env.API_DOMAIN;
      else process.env.API_DOMAIN = prevDomain;
      if (prevWeb === undefined) delete process.env.WEB_URL;
      else process.env.WEB_URL = prevWeb;
    }
  });

  test("uses explicit API_URL for local dev", () => {
    const prevApi = process.env.API_URL;
    const prevDomain = process.env.API_DOMAIN;
    process.env.API_URL = "http://127.0.0.1:3001";
    delete process.env.API_DOMAIN;
    try {
      expect(getServerApiOrigin()).toBe("http://127.0.0.1:3001");
    } finally {
      if (prevApi === undefined) delete process.env.API_URL;
      else process.env.API_URL = prevApi;
      if (prevDomain === undefined) delete process.env.API_DOMAIN;
      else process.env.API_DOMAIN = prevDomain;
    }
  });
});
