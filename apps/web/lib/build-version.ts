/** Resolve the deploy id from environment variables (safe for client bundles). */
export function resolveAppBuildVersionFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv =
    env.VERCEL_GIT_COMMIT_SHA ??
    env.GITHUB_SHA ??
    env.CCO_BUILD_ID ??
    env.NEXT_PUBLIC_APP_VERSION;

  if (fromEnv && fromEnv !== "dev") return fromEnv;
  return "dev";
}

/** Baked at build time — must match /api/app-version on the same deploy. */
export const APP_BUILD_VERSION = resolveAppBuildVersionFromEnv();

declare global {
  interface Window {
    __ccoAppVersion?: string;
  }
}

/** Publish the running bundle version for bootstrap checks before React hydrates. */
export function publishClientBuildVersion(version = APP_BUILD_VERSION): void {
  if (typeof window === "undefined" || version === "dev") return;
  window.__ccoAppVersion = version;
}

/** Keep the SSR meta tag aligned with the running bundle after client navigation. */
export function syncMetaBuildVersion(version: string): void {
  if (typeof document === "undefined" || !version) return;
  publishClientBuildVersion(version);
  const meta = document.querySelector('meta[name="cco-app-version"]');
  meta?.setAttribute("content", version);
}

/** Prefer the running bundle version; SSR meta can lag after client-side navigation. */
export function getClientBuildVersion(fallback = APP_BUILD_VERSION): string {
  if (typeof window !== "undefined") {
    const runtime = window.__ccoAppVersion?.trim();
    if (runtime) return runtime;
  }
  if (typeof document === "undefined") return fallback;
  const meta = document.querySelector('meta[name="cco-app-version"]');
  const content = meta?.getAttribute("content")?.trim();
  return content || fallback;
}

if (typeof window !== "undefined") {
  publishClientBuildVersion();
}
