import { readRuntimeEnv } from "@/lib/runtime-env";

/** True when the web app is built for Cloudflare Pages / OpenNext (not VPS standalone). */
export function isCloudflareDeployTarget(): boolean {
  return readRuntimeEnv("CCO_DEPLOY_TARGET") === "cloudflare";
}

/** True when uploads use R2 via cco-api (Cloudflare BYO). Browser sends multipart to the API worker. */
export function isDirectR2UploadsEnabled(): boolean {
  return isCloudflareDeployTarget();
}
