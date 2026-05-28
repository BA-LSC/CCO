import { describe, expect, test } from "bun:test";
import { CloudflareApiError, parseCloudflareJsonText } from "./cloudflare-api";

describe("parseCloudflareJsonText", () => {
  test("parses valid JSON", () => {
    expect(parseCloudflareJsonText('{"success":true}', 200)).toEqual({ success: true });
  });

  test("returns null for empty body", () => {
    expect(parseCloudflareJsonText("  ", 200)).toBeNull();
  });

  test("throws CloudflareApiError for multipart instead of SyntaxError", () => {
    expect(() => parseCloudflareJsonText("--9511de52cf93\nContent-Disposition: form-data", 200)).toThrow(
      CloudflareApiError,
    );
    expect(() => parseCloudflareJsonText("--9511de52cf93\nContent-Disposition: form-data", 200)).toThrow(
      /Expected JSON response/,
    );
  });

  test("throws CloudflareApiError for SQL comments instead of SyntaxError", () => {
    expect(() => parseCloudflareJsonText("-- migration\nALTER TABLE x", 200)).toThrow(CloudflareApiError);
  });
});
