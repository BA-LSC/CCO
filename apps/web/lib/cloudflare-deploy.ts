import { readRuntimeEnv } from "@/lib/runtime-env";

/** True when the web app is built for Cloudflare Pages / OpenNext. */
export function isCloudflareDeployTarget(): boolean {
  if (readRuntimeEnv("CCO_DEPLOY_TARGET") === "cloudflare") return true;
  // CCO_DEPLOY_TARGET is server-only; Cloudflare Pages builds inline this public flag for the browser.
  if (readRuntimeEnv("NEXT_PUBLIC_DIRECT_UPLOADS") === "1") return true;
  return false;
}

/** True when the browser uploads via presigned R2 PUT (Cloudflare BYO). */
export function isDirectR2UploadsEnabled(): boolean {
  return isCloudflareDeployTarget();
}
