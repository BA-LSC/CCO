import { describe, expect, test } from "bun:test";
import { CCO_INSTALL_HOSTNAME, CCO_INSTALL_ORIGIN } from "./install-origin";

describe("install-origin", () => {
  test("uses setup-c.co hostname", () => {
    expect(CCO_INSTALL_HOSTNAME).toBe("setup-c.co");
    expect(CCO_INSTALL_ORIGIN).toBe("https://setup-c.co");
  });
});
