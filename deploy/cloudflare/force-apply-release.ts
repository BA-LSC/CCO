#!/usr/bin/env bun
/** Force-apply the latest setup-c.co release to a BYO church (CLI recovery). */
import {
  deployAllProvisionWorkers,
  deployCcoWebWorker,
  fetchWebReleaseManifest,
  verifyCloudflareUpdateApplyPermissions,
  type CcoWorkerScriptName,
} from "../../packages/cloudflare-provision/src/index.ts";
import { workerPlacementFromEnv } from "./worker-placement-env.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const d1DatabaseId = requireEnv("CCO_D1_DATABASE_ID");
const orgId = requireEnv("CCO_ORG_ID");
const secretsStoreId = requireEnv("CCO_SECRETS_STORE_ID");
const chatHostname = requireEnv("CHAT_HOSTNAME");
const apiHostname = requireEnv("API_HOSTNAME");
const r2BucketName = requireEnv("CLOUDFLARE_R2_BUCKET");
const kvPresenceNamespaceId = requireEnv("CLOUDFLARE_KV_PRESENCE_NAMESPACE_ID");
const kvDeployNamespaceId = requireEnv("CLOUDFLARE_KV_DEPLOY_NAMESPACE_ID");
const pushQueueId = requireEnv("CLOUDFLARE_PUSH_QUEUE_ID");

const releasesBase =
  process.env.CCO_RELEASES_BASE_URL?.trim().replace(/\/+$/, "") ||
  "https://setup-c.co/releases";

const indexRes = await fetch(`${releasesBase}/release-index.json`);
if (!indexRes.ok) {
  console.error(`Failed to fetch release index: HTTP ${indexRes.status}`);
  process.exit(1);
}
const releaseIndex = (await indexRes.json()) as { version: string };
const targetVersion = releaseIndex.version;
console.log(`Applying release ${targetVersion.slice(0, 12)}… from ${releasesBase}`);

await verifyCloudflareUpdateApplyPermissions({
  accountId,
  apiToken,
  chatHostname,
  apiHostname,
});

const readBundle = async (scriptName: CcoWorkerScriptName) => {
  const res = await fetch(`${releasesBase}/${scriptName}.mjs`);
  if (!res.ok) throw new Error(`Failed to fetch ${scriptName}: HTTP ${res.status}`);
  return res.arrayBuffer();
};

const resources = {
  accountId,
  d1DatabaseId,
  r2BucketName,
  kvPresenceNamespaceId,
  kvDeployNamespaceId,
  pushQueueId,
  chatHostname,
  apiHostname,
};

const workerPlacement = workerPlacementFromEnv();
const deployedWorkers = await deployAllProvisionWorkers({
  accountId,
  apiToken,
  resources,
  secretsStoreId,
  apiHostname,
  readBundle,
  workerPlacement,
});
console.log("Deployed workers:", deployedWorkers.join(", "));

const assetsManifest = await fetchWebReleaseManifest(`${releasesBase}/cco-web-manifest.json`);
await deployCcoWebWorker({
  accountId,
  apiToken,
  chatHostname,
  apiHostname,
  secretsStoreId,
  kvDeployNamespaceId,
  workerModuleUrl: `${releasesBase}/cco-web.mjs`,
  assetsBaseUrl: `${releasesBase}/assets/`,
  assetsManifest,
  releaseVersion: targetVersion,
});
console.log("Deployed cco-web");

const updateRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${d1DatabaseId}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: `UPDATE organizations SET installed_release_version = ?, last_update_check_at = ? WHERE id = ?`,
      params: [targetVersion, Date.now(), orgId],
    }),
  },
);
const updateJson = (await updateRes.json()) as { success?: boolean; errors?: unknown[] };
if (!updateRes.ok || updateJson.success === false) {
  console.error("D1 version update failed:", updateJson.errors ?? updateRes.status);
  process.exit(1);
}

console.log(`Done. installed_release_version = ${targetVersion.slice(0, 12)}…`);
