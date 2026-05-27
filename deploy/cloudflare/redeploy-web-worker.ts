#!/usr/bin/env bun
/** Redeploy cco-web with local OpenNext build output and production bindings. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { $ } from "bun";
import {
  deployCcoWebWorker,
  ensureSecretsStore,
  generateProvisionSecrets,
  seedPlatformStoreSecrets,
} from "@cco/cloudflare-provision";
import { hashWebAssetFile } from "../../packages/cloudflare-provision/src/web-asset-hash.ts";

const ROOT = join(import.meta.dir, "../..");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Required: ${name}`);
    process.exit(1);
  }
  return value;
}

const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const chatHostname = requireEnv("CHAT_HOSTNAME");
const apiHostname = requireEnv("API_HOSTNAME");
const tokenKey = requireEnv("TOKEN_ENCRYPTION_KEY");

function walkAssets(dir: string, base = dir): Record<string, { hash: string; size: number }> {
  const manifest: Record<string, { hash: string; size: number }> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(manifest, walkAssets(full, base));
      continue;
    }
    const rel = relative(base, full).split("\\").join("/");
    manifest[rel] = { hash: hashWebAssetFile(full), size: statSync(full).size };
  }
  return manifest;
}

const assetsDir = join(ROOT, "apps/web/.open-next/assets");
const tmp = join(ROOT, "deploy/cloudflare/.tmp-web-bundle");
const workerPath = join(ROOT, "deploy/cloudflare/.tmp-web-worker.mjs");

await $`rm -rf ${tmp}`.quiet();
await $`mkdir -p ${tmp}`.quiet();
await $`bunx wrangler deploy --dry-run --outdir ${tmp}`.cwd(join(ROOT, "apps/web")).quiet();
await Bun.write(workerPath, readFileSync(join(tmp, "worker.js")));

const secrets = generateProvisionSecrets();
secrets.TOKEN_ENCRYPTION_KEY = tokenKey;

const store = await ensureSecretsStore(accountId, apiToken);
await seedPlatformStoreSecrets(accountId, apiToken, store.id, secrets);

await deployCcoWebWorker({
  accountId,
  apiToken,
  chatHostname,
  apiHostname,
  secretsStoreId: store.id,
  workerModuleUrl: `file://${workerPath}`,
  assetsBaseUrl: `file://${assetsDir}/`,
  assetsManifest: walkAssets(assetsDir),
});

console.log(`Redeployed cco-web for ${chatHostname} -> ${apiHostname}`);
