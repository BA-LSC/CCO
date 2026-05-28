import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Older deployed `cco-api` workers still request this bundle during Apply Update.
 * Giphy is served on `cco-api` at `/v1/giphy`; the standalone proxy is not deployed.
 */
export const LEGACY_RELEASE_WORKER_BUNDLES = {
  "cco-giphy-proxy.mjs": `export default {
  async fetch() {
    return Response.json(
      { error: "cco-giphy-proxy is deprecated; use cco-api /v1/giphy" },
      { status: 410, headers: { "content-type": "application/json" } },
    );
  },
};
`,
} as const;

export function writeLegacyReleaseWorkerBundles(releasesDir: string): void {
  for (const [filename, source] of Object.entries(LEGACY_RELEASE_WORKER_BUNDLES)) {
    writeFileSync(join(releasesDir, filename), source, "utf8");
  }
}
