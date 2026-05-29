import { describe, expect, test } from "bun:test";
import { readRuntimeEnv } from "./runtime-env";

describe("readRuntimeEnv", () => {
  test("reads from process.env only", () => {
    const prev = process.env.CCO_DEPLOY_TARGET;
    process.env.CCO_DEPLOY_TARGET = "cloudflare";
    try {
      expect(readRuntimeEnv("CCO_DEPLOY_TARGET")).toBe("cloudflare");
    } finally {
      if (prev === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prev;
    }
  });
});
