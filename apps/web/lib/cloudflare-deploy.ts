import { readRuntimeEnv } from "@/lib/runtime-env";

/** True when the web app is built for Cloudflare Pages / OpenNext (not VPS standalone). */
export function isCloudflareDeployTarget(): boolean {
  return readRuntimeEnv("CCO_DEPLOY_TARGET") === "cloudflare";
}

/** Direct R2 presigned uploads — required on Cloudflare; optional elsewhere when R2 is configured. */
export function isDirectR2UploadsEnabled(): boolean {
  // NEXT_PUBLIC_* is inlined into browser bundles at build time; worker bindings are server-only.
  if (process.env.NEXT_PUBLIC_DIRECT_UPLOADS === "1") return true;
  return isCloudflareDeployTarget();
}
