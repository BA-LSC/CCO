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

/** Multipart POST is for local dev only; production/BYO must use presigned R2 PUT. */
export function shouldUseMultipartUploadFallback(hostname?: string): boolean {
  if (isDirectR2UploadsEnabled()) return false;

  const resolvedHostname =
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (
    resolvedHostname &&
    resolvedHostname !== "localhost" &&
    resolvedHostname !== "127.0.0.1" &&
    resolvedHostname !== "[::1]"
  ) {
    return false;
  }

  return true;
}
