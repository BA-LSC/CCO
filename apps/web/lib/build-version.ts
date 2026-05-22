/** Resolve the deploy id baked into client bundles and /api/app-version. */
export function resolveAppBuildVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? env.CCO_BUILD_ID;

  if (fromEnv && fromEnv !== "dev") return fromEnv;
  if (env.NODE_ENV === "production") return `build-${Date.now()}`;
  return "dev";
}

/** Baked at build time — must match /api/app-version on the same deploy. */
export const APP_BUILD_VERSION = resolveAppBuildVersion();
