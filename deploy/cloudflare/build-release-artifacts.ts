#!/usr/bin/env bun
/**
 * Build Cloudflare release artifacts for BYO install (worker bundles + web worker + asset manifest).
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { $ } from "bun";

const ROOT = join(import.meta.dir, "../..");
const RELEASES = join(ROOT, "deploy/cloudflare/releases");
const ASSETS_OUT = join(RELEASES, "assets");

console.log("Building packages...");
await $`bun run build:packages`.cwd(ROOT);

const { hashWebAssetFile } = await import(
  "../../packages/cloudflare-provision/src/web-asset-hash.ts"
);

function hashFile(path: string): { hash: string; size: number } {
  return { hash: hashWebAssetFile(path), size: statSync(path).size };
}

function walkAssets(dir: string, base = dir): Record<string, { hash: string; size: number }> {
  const manifest: Record<string, { hash: string; size: number }> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(manifest, walkAssets(full, base));
      continue;
    }
    const rel = relative(base, full).split("\\").join("/");
    manifest[rel] = hashFile(full);
  }
  return manifest;
}

console.log("Building worker bundles...");
await $`bash deploy/cloudflare/build-worker-bundles.sh`.cwd(ROOT);

console.log("Building web (OpenNext)...");
await $`bun run --cwd apps/web build:cloudflare`.cwd(ROOT);

rmSync(RELEASES, { recursive: true, force: true });
mkdirSync(RELEASES, { recursive: true });
mkdirSync(ASSETS_OUT, { recursive: true });

const bundlesDir = join(ROOT, "deploy/cloudflare/bundles");
for (const name of readdirSync(bundlesDir)) {
  if (!name.endsWith(".mjs")) continue;
  cpSync(join(bundlesDir, name), join(RELEASES, name));
}

console.log("Building web worker bundle (wrangler dry-run bundles OpenNext stub + deps)...");
const webTmp = `${ROOT}/deploy/cloudflare/.tmp-web-bundle`;
await $`rm -rf ${webTmp}`.cwd(ROOT).quiet();
await $`mkdir -p ${webTmp}`.cwd(ROOT);
await $`bunx wrangler deploy --dry-run --outdir ${webTmp}`.cwd(`${ROOT}/apps/web`);
cpSync(join(webTmp, "worker.js"), join(RELEASES, "cco-web.mjs"));
await $`rm -rf ${webTmp}`.cwd(ROOT).quiet();

cpSync(join(ROOT, "apps/web/.open-next/assets"), ASSETS_OUT, { recursive: true });
cpSync(
  join(ROOT, "packages/db/drizzle/d1/0000_d1_baseline.sql"),
  join(RELEASES, "0000_d1_baseline.sql"),
);
cpSync(
  join(ROOT, "packages/db/drizzle/d1/0001_org_release_updates.sql"),
  join(RELEASES, "0001_org_release_updates.sql"),
);
cpSync(
  join(ROOT, "packages/db/drizzle/d1/0003_org_git_repo_url.sql"),
  join(RELEASES, "0003_org_git_repo_url.sql"),
);

const manifest = walkAssets(ASSETS_OUT);
writeFileSync(join(RELEASES, "cco-web-manifest.json"), JSON.stringify(manifest, null, 2));

const gitSha =
  process.env.GITHUB_SHA?.trim() ||
  (await $`git rev-parse HEAD`.cwd(ROOT).quiet().text()).trim();
const gitRef = process.env.GITHUB_REF_NAME?.trim() || "main";
const releaseIndex = {
  version: gitSha,
  gitRef,
  publishedAt: new Date().toISOString(),
  releasesBaseUrl: "https://setup-c.co/releases",
};
writeFileSync(join(RELEASES, "release-index.json"), JSON.stringify(releaseIndex, null, 2));

const releaseReadme = `# CCO Cloudflare release artifacts

Host this directory at \`https://setup-c.co/releases\` (or set CCO_RELEASES_BASE_URL / CCO_WORKER_BUNDLES_BASE_URL).

- Worker bundles: \`cco-*.mjs\`
- Web worker: \`cco-web.mjs\`
- Web static assets: \`assets/\`
- Web manifest: \`cco-web-manifest.json\`
- Release catalog: \`release-index.json\` (version + git ref for Admin Updates)
- D1 baseline: \`0000_d1_baseline.sql\`
- D1 incremental migrations: \`0001_org_release_updates.sql\` (Admin Updates day-two schema)
`;
writeFileSync(join(RELEASES, "README.md"), releaseReadme);

const stat = statSync(join(RELEASES, "cco-web.mjs"));
console.log(`Release artifacts ready in ${RELEASES}`);
console.log(`  Web worker: ${(stat.size / 1024 / 1024).toFixed(1)} MiB`);
console.log(`  Asset files: ${Object.keys(manifest).length}`);
