import { describe, expect, test } from "bun:test";
import {
  deriveApiHostname,
  resolveRuntimeWebSocketUrl,
  resolveWebSocketBase,
} from "./websocket-url";

describe("deriveApiHostname", () => {
  test("maps web subdomain to api on the zone root", () => {
    expect(deriveApiHostname("chat.example.com")).toBe("api.example.com");
    expect(deriveApiHostname("cco.lscavl.dev")).toBe("api.lscavl.dev");
  });

  test("prefixes api for bare hostnames", () => {
    expect(deriveApiHostname("example.com")).toBe("api.example.com");
  });

  test("leaves api host unchanged", () => {
    expect(deriveApiHostname("api.example.com")).toBe("api.example.com");
  });
});

describe("resolveWebSocketBase", () => {
  test("uses configured production URL", () => {
    expect(
      resolveWebSocketBase({ configured: "wss://api.example.com" }),
    ).toBe("wss://api.example.com");
  });

  test("ignores localhost config on HTTPS pages", () => {
    expect(
      resolveWebSocketBase({
        configured: "ws://localhost:3001",
        windowProtocol: "https:",
        windowHost: "chat.example.com",
      }),
    ).toBe("wss://api.example.com");
  });

  test("derives from NEXT_PUBLIC_WEB_URL when config missing", () => {
    expect(
      resolveWebSocketBase({
        webUrl: "https://chat.example.com",
      }),
    ).toBe("wss://api.example.com");
  });

  test("falls back to localhost for dev", () => {
    expect(resolveWebSocketBase({})).toBe("ws://localhost:3001");
  });
});

describe("resolveRuntimeWebSocketUrl", () => {
  test("prefers API_DOMAIN over hostname guessing", () => {
    expect(
      resolveRuntimeWebSocketUrl({
        nextPublicWsUrl: "",
        apiDomain: "api.mychurch.org",
        webUrl: "https://chat.mychurch.org",
      }),
    ).toBe("wss://api.mychurch.org");
  });

  test("uses NEXT_PUBLIC_WS_URL when set for production", () => {
    expect(
      resolveRuntimeWebSocketUrl({
        nextPublicWsUrl: "wss://api.example.com",
        apiDomain: "api.other.com",
      }),
    ).toBe("wss://api.example.com");
  });
});
