import { describe, expect, test } from "bun:test";
import {
  buildR2UploadCorsRules,
  expandWwwOriginVariants,
  parseHttpOrigin,
  resolveR2UploadChatOrigins,
} from "./r2-cors";

describe("parseHttpOrigin", () => {
  test("normalizes full URLs and bare hostnames", () => {
    expect(parseHttpOrigin("https://cco.example.com/")).toBe("https://cco.example.com");
    expect(parseHttpOrigin("cco.example.com")).toBe("https://cco.example.com");
    expect(parseHttpOrigin("http://localhost:3000/chat")).toBe("http://localhost:3000");
  });
});

describe("expandWwwOriginVariants", () => {
  test("adds www and apex pairs for production hostnames", () => {
    expect(expandWwwOriginVariants(["https://cco.example.com"])).toEqual([
      "https://cco.example.com",
      "https://www.cco.example.com",
    ]);
    expect(expandWwwOriginVariants(["https://www.cco.example.com"])).toEqual([
      "https://www.cco.example.com",
      "https://cco.example.com",
    ]);
  });

  test("does not add www for localhost", () => {
    expect(expandWwwOriginVariants(["http://localhost:3000"])).toEqual([
      "http://localhost:3000",
    ]);
  });
});

describe("resolveR2UploadChatOrigins", () => {
  test("merges deployment URL, OAuth redirect, and browser Origin with www variants", () => {
    expect(
      resolveR2UploadChatOrigins({
        webUrl: "https://cco.example.com",
        signInRedirectUri: "https://cco.example.com/api/auth/pco/callback",
        requestOrigin: "https://www.cco.example.com",
      }),
    ).toEqual(["https://cco.example.com", "https://www.cco.example.com"]);
  });

  test("uses explicit client chat origin from presign body", () => {
    expect(
      resolveR2UploadChatOrigins({
        clientChatOrigin: "https://custom.chat.example.com",
      }),
    ).toEqual([
      "https://custom.chat.example.com",
      "https://www.custom.chat.example.com",
    ]);
  });

  test("derives origin from Referer when Origin is omitted", () => {
    expect(
      resolveR2UploadChatOrigins({
        requestReferer: "https://chat.example.com/groups/abc",
      }),
    ).toEqual(["https://chat.example.com", "https://www.chat.example.com"]);
  });
});

describe("buildR2UploadCorsRules", () => {
  test("allows PUT from chat origin with wildcard request headers", () => {
    const rules = buildR2UploadCorsRules(["https://cco.example.com"]);
    expect(rules).toEqual([
      {
        allowed: {
          origins: ["https://cco.example.com", "https://www.cco.example.com"],
          methods: ["PUT", "GET", "HEAD"],
          headers: ["*"],
        },
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
    ]);
  });

  test("normalizes bare hostnames and dedupes origins", () => {
    const rules = buildR2UploadCorsRules([
      "cco.example.com",
      "https://cco.example.com/",
      "",
    ]);
    expect(rules[0]?.allowed.origins).toEqual([
      "https://cco.example.com",
      "https://www.cco.example.com",
    ]);
  });
});
