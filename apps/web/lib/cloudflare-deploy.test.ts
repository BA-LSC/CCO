import { describe, expect, test } from "bun:test";
import { isCloudflareDeployTarget, isDirectR2UploadsEnabled } from "./cloudflare-deploy";

describe("isDirectR2UploadsEnabled", () => {
  test("enables direct uploads when NEXT_PUBLIC_DIRECT_UPLOADS is set at build time", () => {
    const prev = process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
    const prevTarget = process.env.CCO_DEPLOY_TARGET;
    delete process.env.CCO_DEPLOY_TARGET;
    process.env.NEXT_PUBLIC_DIRECT_UPLOADS = "1";
    try {
      expect(isDirectR2UploadsEnabled()).toBe(true);
      expect(isCloudflareDeployTarget()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
      else process.env.NEXT_PUBLIC_DIRECT_UPLOADS = prev;
      if (prevTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prevTarget;
    }
  });

  test("enables direct uploads from CCO_DEPLOY_TARGET on server", () => {
    const prev = process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
    const prevTarget = process.env.CCO_DEPLOY_TARGET;
    delete process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
    process.env.CCO_DEPLOY_TARGET = "cloudflare";
    try {
      expect(isDirectR2UploadsEnabled()).toBe(true);
      expect(isCloudflareDeployTarget()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
      else process.env.NEXT_PUBLIC_DIRECT_UPLOADS = prev;
      if (prevTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prevTarget;
    }
  });
});
