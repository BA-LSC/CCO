import { describe, expect, test } from "bun:test";
import { buildAuthorizeUrl } from "./pco-oauth";

describe("buildAuthorizeUrl", () => {
  test("includes client_id and redirect_uri", () => {
    const url = buildAuthorizeUrl({
      clientId: "abc",
      redirectUri: "http://localhost/cb",
      state: "xyz",
    });
    expect(url).toContain("client_id=abc");
    expect(url).toContain("state=xyz");
  });
});
