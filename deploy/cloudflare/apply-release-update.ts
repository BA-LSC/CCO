#!/usr/bin/env bun
/**
 * Operator helper to redeploy CCO worker bundles from published release artifacts.
 * Production BYO orgs should use Admin Settings → Apply update (runs inside the API worker).
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *   API_HOSTNAME=api.example.com CHAT_HOSTNAME=chat.example.com \
 *   CCO_RELEASES_BASE_URL=https://setup-c.co/releases \
 *   bun deploy/cloudflare/apply-release-update.ts
 */
import { $ } from "bun";
import {
  deployAllProvisionWorkers,
  deployCcoWebWorker,
  fetchWebReleaseManifest,
  verifyCloudflareUpdateApplyPermissions,
} from "../../packages/cloudflare-provision/src/index.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

async function main(): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const apiHostname = process.env.API_HOSTNAME?.trim();
  const chatHostname = process.env.CHAT_HOSTNAME?.trim() ?? apiHostname;
  const releasesBase = (process.env.CCO_RELEASES_BASE_URL ?? "https://setup-c.co/releases").replace(
    /\/+$/,
    "",
  );

  if (!accountId || !apiToken || !apiHostname || !chatHostname) {
    console.error("CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, API_HOSTNAME are required");
    process.exit(1);
  }

  await verifyCloudflareUpdateApplyPermissions({
    accountId,
    apiToken,
    apiHostname,
    chatHostname,
  });

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const cfInternal = process.env.CF_INTERNAL_SECRET?.trim();
  if (!sessionSecret || !tokenKey || !cfInternal) {
    console.error("SESSION_SECRET, TOKEN_ENCRYPTION_KEY, CF_INTERNAL_SECRET are required");
    process.exit(1);
  }

  const secrets = {
    SESSION_SECRET: sessionSecret,
    TOKEN_ENCRYPTION_KEY: tokenKey,
    CF_INTERNAL_SECRET: cfInternal,
  };

  const readBundle = async (scriptName: string) => {
    const res = await fetch(`${releasesBase}/${scriptName}.mjs`);
    if (!res.ok) throw new Error(`Failed to fetch ${scriptName}.mjs: HTTP ${res.status}`);
    return res.arrayBuffer();
  };

  const resources = {
    accountId,
    d1DatabaseId: process.env.CCO_D1_DATABASE_ID?.trim() ?? "",
    r2BucketName: process.env.CLOUDFLARE_R2_BUCKET?.trim() ?? "",
    kvPresenceNamespaceId: process.env.CCO_KV_PRESENCE_ID?.trim() ?? "",
    kvDeployNamespaceId: process.env.CCO_KV_DEPLOY_ID?.trim() ?? "",
    pushQueueId: process.env.CCO_PUSH_QUEUE_ID?.trim() ?? "",
    chatHostname,
    apiHostname,
  };

  console.log("Deploying API workers from", releasesBase);
  const deployed = await deployAllProvisionWorkers({
    accountId,
    apiToken,
    resources,
    secrets,
    apiHostname,
    readBundle,
  });
  console.log("Deployed:", deployed.join(", "));

  const assetsManifest = await fetchWebReleaseManifest(`${releasesBase}/cco-web-manifest.json`);
  await deployCcoWebWorker({
    accountId,
    apiToken,
    chatHostname,
    apiHostname,
    secrets,
    workerModuleUrl: `${releasesBase}/cco-web.mjs`,
    assetsBaseUrl: `${releasesBase}/assets/`,
    assetsManifest,
  });
  console.log("cco-web deployed");

  await $`echo "Done"`.cwd(ROOT).quiet();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
