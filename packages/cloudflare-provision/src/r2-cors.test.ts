import { describe, expect, test } from "bun:test";
import { buildR2UploadCorsRules } from "./r2-cors";

describe("buildR2UploadCorsRules", () => {
  test("allows PUT from chat origin with Content-Type header", () => {
    const rules = buildR2UploadCorsRules(["https://cco.example.com"]);
    expect(rules).toEqual([
      {
        allowed: {
          origins: ["https://cco.example.com"],
          methods: ["PUT", "GET", "HEAD"],
          headers: ["Content-Type", "content-type"],
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
    expect(rules[0]?.allowed.origins).toEqual(["https://cco.example.com"]);
  });
});
