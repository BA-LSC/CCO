#!/usr/bin/env bun
/** Redeploy cco-api with a fresh bundle (preserves existing worker secrets). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWorkerBindings,
  deployWorkerScript,
  type CcoWorkerScriptName,
} from "@cco/cloudflare-provision";

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
const apiHostname = requireEnv("API_HOSTNAME");
const chatHostname = requireEnv("CHAT_HOSTNAME");
const d1DatabaseId = requireEnv("CCO_D1_DATABASE_ID");
const r2BucketName = requireEnv("CLOUDFLARE_R2_BUCKET");
const kvPresenceNamespaceId = requireEnv("CLOUDFLARE_KV_PRESENCE_NAMESPACE_ID");
const kvDeployNamespaceId = requireEnv("CLOUDFLARE_KV_DEPLOY_NAMESPACE_ID");
const pushQueueId = process.env.CLOUDFLARE_PUSH_QUEUE_ID?.trim() || "placeholder";

const scriptName: CcoWorkerScriptName = "cco-api";
const bundlePath = join(ROOT, "deploy/cloudflare/bundles/cco-api.mjs");
const moduleBytes = readFileSync(bundlePath).buffer;

const bindings = buildWorkerBindings(scriptName, {
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
});

await deployWorkerScript(accountId, apiToken, scriptName, moduleBytes, bindings, {
  compatibilityDate: "2025-05-26",
  compatibilityFlags: ["nodejs_compat"],
});

console.log(`Redeployed ${scriptName} for ${apiHostname} (secrets unchanged)`);
