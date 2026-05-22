import { describe, expect, test } from "bun:test";
import { deriveApiHostname, resolveWebSocketBase } from "./websocket-url";

describe("deriveApiHostname", () => {
  test("maps chat subdomain to api.chat", () => {
    expect(deriveApiHostname("chat.example.com")).toBe("api.chat.example.com");
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
      resolveWebSocketBase({ configured: "wss://api.chat.example.com" }),
    ).toBe("wss://api.chat.example.com");
  });

  test("ignores localhost config on HTTPS pages", () => {
    expect(
      resolveWebSocketBase({
        configured: "ws://localhost:3001",
        windowProtocol: "https:",
        windowHost: "chat.example.com",
      }),
    ).toBe("wss://api.chat.example.com");
  });

  test("derives from NEXT_PUBLIC_WEB_URL when config missing", () => {
    expect(
      resolveWebSocketBase({
        webUrl: "https://chat.example.com",
      }),
    ).toBe("wss://api.chat.example.com");
  });

  test("falls back to localhost for dev", () => {
    expect(resolveWebSocketBase({})).toBe("ws://localhost:3001");
  });
});
