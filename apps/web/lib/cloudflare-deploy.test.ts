import { describe, expect, test } from "bun:test";
import { isCloudflareDeployTarget, isDirectR2UploadsEnabled } from "./cloudflare-deploy";

describe("isDirectR2UploadsEnabled", () => {
  test("matches Cloudflare deploy target only", () => {
    const prevTarget = process.env.CCO_DEPLOY_TARGET;
    const prevDirect = process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
    delete process.env.CCO_DEPLOY_TARGET;
    delete process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
    try {
      expect(isDirectR2UploadsEnabled()).toBe(false);
      expect(isCloudflareDeployTarget()).toBe(false);
    } finally {
      if (prevTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prevTarget;
      if (prevDirect === undefined) delete process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
      else process.env.NEXT_PUBLIC_DIRECT_UPLOADS = prevDirect;
    }
  });

  test("detects Cloudflare builds via NEXT_PUBLIC_DIRECT_UPLOADS in the browser", () => {
    const prevTarget = process.env.CCO_DEPLOY_TARGET;
    const prevDirect = process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
    delete process.env.CCO_DEPLOY_TARGET;
    process.env.NEXT_PUBLIC_DIRECT_UPLOADS = "1";
    try {
      expect(isCloudflareDeployTarget()).toBe(true);
      expect(isDirectR2UploadsEnabled()).toBe(true);
    } finally {
      if (prevTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prevTarget;
      if (prevDirect === undefined) delete process.env.NEXT_PUBLIC_DIRECT_UPLOADS;
      else process.env.NEXT_PUBLIC_DIRECT_UPLOADS = prevDirect;
    }
  });

  test("enables R2 worker uploads from CCO_DEPLOY_TARGET on server", () => {
    const prevTarget = process.env.CCO_DEPLOY_TARGET;
    process.env.CCO_DEPLOY_TARGET = "cloudflare";
    try {
      expect(isDirectR2UploadsEnabled()).toBe(true);
      expect(isCloudflareDeployTarget()).toBe(true);
    } finally {
      if (prevTarget === undefined) delete process.env.CCO_DEPLOY_TARGET;
      else process.env.CCO_DEPLOY_TARGET = prevTarget;
    }
  });
});
