import { readRuntimeEnv } from "@/lib/runtime-env";

/** True when the web app is built for Cloudflare Pages / OpenNext (not VPS standalone). */
export function isCloudflareDeployTarget(): boolean {
  if (readRuntimeEnv("CCO_DEPLOY_TARGET") === "cloudflare") return true;
  // CCO_DEPLOY_TARGET is server-only; Cloudflare Pages builds inline this public flag for the browser.
  if (readRuntimeEnv("NEXT_PUBLIC_DIRECT_UPLOADS") === "1") return true;
  return false;
}

/** True when uploads use R2 via cco-api (Cloudflare BYO). Browser sends multipart to the API worker. */
export function isDirectR2UploadsEnabled(): boolean {
  return isCloudflareDeployTarget();
}
