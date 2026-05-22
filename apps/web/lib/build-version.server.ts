import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAppBuildVersionFromEnv } from "@/lib/build-version";

let cachedBakedBuildId: string | undefined;

/** Read BUILD_ID written during `next build` / Docker image build (matches client bundles). */
function readBakedBuildId(): string | null {
  if (cachedBakedBuildId !== undefined) {
    return cachedBakedBuildId || null;
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

/** Resolve the deploy id for server routes (prefers baked BUILD_ID file). */
export function resolveAppBuildVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromFile = readBakedBuildId();
  if (fromFile) return fromFile;
  return resolveAppBuildVersionFromEnv(env);
}
