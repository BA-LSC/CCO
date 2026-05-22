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

/** Prefer the SSR meta tag so cached JS bundles do not trigger reload loops. */
export function getClientBuildVersion(fallback = APP_BUILD_VERSION): string {
  if (typeof document === "undefined") return fallback;
  const meta = document.querySelector('meta[name="cco-app-version"]');
  const content = meta?.getAttribute("content")?.trim();
  return content || fallback;
}
