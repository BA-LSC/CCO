import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAppBuildVersionFromEnv } from "@/lib/build-version";

function webAppRoot(): string {
  try {
    if (typeof __dirname !== "undefined") {
      return join(__dirname, "..");
    }
  } catch {
    // Workers may not define __dirname.
  }
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

let cachedBakedBuildId: string | undefined;

/** Read BUILD_ID written during `next build` / Docker image build (matches client bundles). */
function readBakedBuildId(): string | null {
  if (cachedBakedBuildId !== undefined) {
    return cachedBakedBuildId || null;
  }

  for (const relativePath of ["BUILD_ID", ".next/BUILD_ID"] as const) {
    try {
      const buildIdPath = join(
        /* turbopackIgnore: true */ webAppRoot(),
        ...relativePath.split("/"),
      );
      if (!existsSync(buildIdPath)) continue;
      const id = readFileSync(buildIdPath, "utf8").trim();
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

/** Resolve the deploy id for server routes (must match client APP_BUILD_VERSION). */
export function resolveAppBuildVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = resolveAppBuildVersionFromEnv(env);
  if (fromEnv !== "dev") return fromEnv;

  const fromFile = readBakedBuildId();
  if (fromFile) return fromFile;

  return "dev";
}
