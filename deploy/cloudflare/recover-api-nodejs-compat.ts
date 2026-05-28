#!/usr/bin/env bun
/**
 * One-shot recovery when Admin Apply fails with `No such module "node:https"` on cco-api.
 *
 * Admin Apply runs deploy logic inside the currently deployed API worker. Until cco-api is
 * redeployed with nodejs_compat, Apply cannot fix itself. This script uses the fixed
 * provision client from the repo (Bun) and the latest setup-c.co release bundle.
 *
 * Required env: same as force-apply-release.ts (CLOUDFLARE_API_TOKEN, account, hostnames, D1, KV, R2, queue, secrets store).
 * Optional: CCO_RELEASES_BASE_URL (default https://setup-c.co/releases)
 */
import {
  buildWorkerBindings,
  buildWorkerSecretsStoreBindings,
  CCO_WORKER_COMPATIBILITY_DATE,
  CCO_WORKER_NODEJS_COMPAT_FLAGS,
  deployWorkerScript,
  type CcoWorkerScriptName,
} from "../../packages/cloudflare-provision/src/index.ts";

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
const apiHostname = requireEnv("API_HOSTNAME");
const chatHostname = requireEnv("CHAT_HOSTNAME");
const d1DatabaseId = requireEnv("CCO_D1_DATABASE_ID");
const r2BucketName = requireEnv("CLOUDFLARE_R2_BUCKET");
const kvPresenceNamespaceId = requireEnv("CLOUDFLARE_KV_PRESENCE_NAMESPACE_ID");
const kvDeployNamespaceId = requireEnv("CLOUDFLARE_KV_DEPLOY_NAMESPACE_ID");
const pushQueueId = requireEnv("CLOUDFLARE_PUSH_QUEUE_ID");
const secretsStoreId = requireEnv("CCO_SECRETS_STORE_ID");

const releasesBase =
  process.env.CCO_RELEASES_BASE_URL?.trim().replace(/\/+$/, "") ||
  "https://setup-c.co/releases";

const scriptName: CcoWorkerScriptName = "cco-api";
const indexRes = await fetch(`${releasesBase}/release-index.json`);
if (!indexRes.ok) {
  console.error(`Failed to fetch release index: HTTP ${indexRes.status}`);
  process.exit(1);
}
const { version } = (await indexRes.json()) as { version: string };
console.log(`Recovering ${scriptName} from release ${version.slice(0, 12)}…`);

const bundleRes = await fetch(`${releasesBase}/${scriptName}.mjs`);
if (!bundleRes.ok) {
  console.error(`Failed to fetch ${scriptName}.mjs: HTTP ${bundleRes.status}`);
  process.exit(1);
}
const moduleBytes = await bundleRes.arrayBuffer();

const bindings = [
  ...buildWorkerBindings(scriptName, {
    resources: {
      accountId,
      d1DatabaseId,
      r2BucketName,
      kvPresenceNamespaceId,
      kvDeployNamespaceId,
      pushQueueId,
      apiHostname,
      chatHostname,
    },
    secrets: {
      SESSION_SECRET: "",
      TOKEN_ENCRYPTION_KEY: "",
      CF_INTERNAL_SECRET: "",
    },
    apiHostname,
    chatHostname,
  }),
  ...buildWorkerSecretsStoreBindings(scriptName, secretsStoreId),
];

await deployWorkerScript(accountId, apiToken, scriptName, moduleBytes, bindings, {
  compatibilityDate: CCO_WORKER_COMPATIBILITY_DATE,
  compatibilityFlags: [...CCO_WORKER_NODEJS_COMPAT_FLAGS],
});

console.log(
  `Redeployed ${scriptName} with nodejs_compat. Retry Admin → Updates → Apply, or run force-apply-release.ts for a full release.`,
);
