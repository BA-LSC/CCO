import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cachedBakedBuildId: string | undefined;

/** Read BUILD_ID written during `next build` / Docker image build (matches client bundles). */
function readBakedBuildId(): string | null {
  if (cachedBakedBuildId !== undefined) {
    return cachedBakedBuildId || null;
  }

  if (typeof window !== "undefined") {
    cachedBakedBuildId = "";
    return null;
  }

  const cwd = process.cwd();
  for (const relativePath of ["BUILD_ID", join(".next", "BUILD_ID")]) {
    try {
      const path = join(cwd, relativePath);
      if (!existsSync(path)) continue;
      const id = readFileSync(path, "utf8").trim();
      if (id && id !== "dev") {
        cachedBakedBuildId = id;
        return id;
      }
    } catch {
      // ignore unreadable build id files
    }
  }

  cachedBakedBuildId = "";
  return null;
}

/** @internal Test helper — resets the baked build id memo. */
export function clearBuildVersionCacheForTests(): void {
  cachedBakedBuildId = undefined;
}

/** Resolve the deploy id baked into client bundles and /api/app-version. */
export function resolveAppBuildVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromFile = readBakedBuildId();
  if (fromFile) return fromFile;

  const fromEnv =
    env.VERCEL_GIT_COMMIT_SHA ??
    env.GITHUB_SHA ??
    env.CCO_BUILD_ID ??
    env.NEXT_PUBLIC_APP_VERSION;

  if (fromEnv && fromEnv !== "dev") return fromEnv;
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
