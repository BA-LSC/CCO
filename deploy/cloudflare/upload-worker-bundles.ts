#!/usr/bin/env bun
/**
 * Upload pre-built worker bundles to the org Cloudflare account.
 * Requires build-worker-bundles.sh to have run first.
 */
import {
  CCO_PUSH_QUEUE_NAME,
  defaultWorkerBundleDir,
  deployAllProvisionWorkers,
  ensureD1Database,
  ensureKvNamespace,
  ensureQueue,
  ensureR2Bucket,
  ensureR2BucketCors,
  ensureSecretsStore,
  generateProvisionSecrets,
  listCloudflareAccounts,
  seedPlatformStoreSecrets,
  type CcoWorkerScriptName,
} from "@cco/cloudflare-provision";
import { resolveCloudflareAccountId } from "../../services/api/src/services/cloudflare-realtimekit-provision";

const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const apiDomain = process.env.API_DOMAIN?.trim();
const internalSecret = process.env.CF_INTERNAL_SECRET?.trim();
const accountIdOverride = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const bundleDir = process.env.CCO_WORKER_BUNDLE_DIR?.trim() || defaultWorkerBundleDir();
const d1Name = process.env.CCO_D1_DATABASE_NAME?.trim() || "cco";

if (!apiToken) {
  console.error("Set CLOUDFLARE_API_TOKEN");
  process.exit(1);
}
if (!apiDomain) {
  console.error("Set API_DOMAIN (e.g. api.example.com)");
  process.exit(1);
}
if (!internalSecret) {
  console.error("Set CF_INTERNAL_SECRET (shared with API internal routes)");
  process.exit(1);
}

const accounts = await listCloudflareAccounts(apiToken);
const accountId = resolveCloudflareAccountId(accounts, accountIdOverride);

const r2BucketName =
  process.env.CLOUDFLARE_R2_BUCKET?.trim() || `cco-uploads-${accountId.slice(0, 8).toLowerCase()}`;
const chatDomain = process.env.CHAT_DOMAIN?.trim();

console.log(`Provisioning resources in account ${accountId}...`);
const [d1, r2, presenceKv, deployKv, pushQueue] = await Promise.all([
  ensureD1Database(accountId, apiToken, d1Name),
  ensureR2Bucket(accountId, apiToken, r2BucketName),
  ensureKvNamespace(accountId, apiToken, "cco-presence"),
  ensureKvNamespace(accountId, apiToken, "cco-deploy"),
  ensureQueue(accountId, apiToken, CCO_PUSH_QUEUE_NAME),
]);

if (chatDomain) {
  await ensureR2BucketCors(accountId, apiToken, r2BucketName, [chatDomain]).catch((err) => {
    console.warn(
      "[upload-worker-bundles] R2 upload CORS configuration skipped:",
      err instanceof Error ? err.message : err,
    );
  });
}

const secrets = {
  ...generateProvisionSecrets(),
  CF_INTERNAL_SECRET: internalSecret,
};

const store = await ensureSecretsStore(accountId, apiToken);
await seedPlatformStoreSecrets(accountId, apiToken, store.id, secrets);

const resources = {
  accountId,
  d1DatabaseId: d1.uuid,
  r2BucketName,
  kvPresenceNamespaceId: presenceKv.id,
  kvDeployNamespaceId: deployKv.id,
  pushQueueId: pushQueue.queue_id,
  apiHostname: apiDomain,
  secretsStoreId: store.id,
};

const readBundle = async (scriptName: CcoWorkerScriptName) => {
  const path = `${bundleDir}/${scriptName}.mjs`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Missing bundle ${path}. Run ./deploy/cloudflare/build-worker-bundles.sh`);
  }
  return file.arrayBuffer();
};

console.log(`Deploying worker bundles from ${bundleDir}...`);
const deployed = await deployAllProvisionWorkers({
  accountId,
  apiToken,
  resources,
  secretsStoreId: store.id,
  apiHostname: apiDomain,
  readBundle,
});

console.log("Deployed workers:", deployed.join(", "));
console.log(
  JSON.stringify(
    {
      accountId,
      d1DatabaseId: d1.uuid,
      r2BucketName,
      r2Created: r2.created,
      kvPresenceNamespaceId: presenceKv.id,
      kvDeployNamespaceId: deployKv.id,
      pushQueueId: pushQueue.queue_id,
      workerScriptNames: deployed,
    },
    null,
    2,
  ),
);
