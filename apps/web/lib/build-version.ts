/** Resolve the deploy id baked into client bundles and /api/app-version. */
export function resolveAppBuildVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv =
    env.VERCEL_GIT_COMMIT_SHA ??
    env.GITHUB_SHA ??
    env.CCO_BUILD_ID ??
    env.NEXT_PUBLIC_APP_VERSION;

  if (fromEnv && fromEnv !== "dev") return fromEnv;
  if (env.NODE_ENV === "production") return `build-${Date.now()}`;
  return "dev";
}

/** Baked at build time — must match /api/app-version on the same deploy. */
export const APP_BUILD_VERSION = resolveAppBuildVersion();

/** Prefer the SSR meta tag so cached JS bundles do not trigger reload loops. */
export function getClientBuildVersion(fallback = APP_BUILD_VERSION): string {
  if (typeof document === "undefined") return fallback;
  const meta = document.querySelector('meta[name="cco-app-version"]');
  const content = meta?.getAttribute("content")?.trim();
  return content || fallback;
}
