#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createInitialProvisionState,
  createMemoryProvisionStore,
  loadProvisionState,
  provisionSessionKey,
  runProvisionPipeline,
  PROVISION_STEP_ORDER,
  type CcoWorkerScriptName,
  type WebAssetManifest,
} from "../../packages/cloudflare-provision/src/index.ts";
import { createInstallProvisionHandlers } from "../../workers/install-orchestrator/src/provision-handlers";

const ROOT = join(import.meta.dir, "../..");
const RELEASES = join(ROOT, "deploy/cloudflare/releases");

const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
const chatHostname = process.env.CHAT_HOSTNAME?.trim();
const apiHostname = process.env.API_HOSTNAME?.trim();
const churchName = process.env.CHURCH_NAME?.trim() || "CCO Church";

const required = [
  ["CLOUDFLARE_API_TOKEN", apiToken],
  ["CLOUDFLARE_ACCOUNT_ID", accountId],
  ["CLOUDFLARE_ZONE_ID", zoneId],
  ["CHAT_HOSTNAME", chatHostname],
  ["API_HOSTNAME", apiHostname],
] as const;

for (const [name, value] of required) {
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
}

function readRelease(path: string): ArrayBuffer {
  const bytes = readFileSync(join(RELEASES, path));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const releasesBaseUrl = `file://${RELEASES}`;

const handlers = await createInstallProvisionHandlers({
  releasesBaseUrl,
  readWorkerBundle: async (scriptName: CcoWorkerScriptName) => readRelease(`${scriptName}.mjs`),
  fetchWebManifest: async () =>
    JSON.parse(readFileSync(join(RELEASES, "cco-web-manifest.json"), "utf8")) as WebAssetManifest,
  fetchD1BaselineSql: async () =>
    readFileSync(join(RELEASES, "0000_d1_baseline.sql"), "utf8"),
});

const { finalize_org: _finalizeOrg, ...provisionHandlers } = handlers;

const sessionId = `provision-only-${Date.now()}`;
const store = createMemoryProvisionStore();
const initial = createInitialProvisionState(churchName);
initial.resources.accountId = accountId;
initial.resources.zoneId = zoneId;
initial.resources.chatHostname = chatHostname;
initial.resources.apiHostname = apiHostname;
await store.put(provisionSessionKey(sessionId), JSON.stringify(initial));

console.log(`Provision-only for ${chatHostname} / ${apiHostname} (no import, no finalize_org handler)`);

let failedStep: string | undefined;
let failedError: string | undefined;

try {
  await runProvisionPipeline(
    sessionId,
    store,
    {
      apiToken: apiToken!,
      accountId: accountId!,
      zoneId: zoneId!,
      chatHostname: chatHostname!,
      apiHostname: apiHostname!,
    },
    provisionHandlers,
  );
} catch (err) {
  const state = await loadProvisionState(store, sessionId);
  if (state) {
    for (const step of PROVISION_STEP_ORDER) {
      const st = state.stepStatus[step];
      if (st?.status === "failed") {
        failedStep = step;
        failedError = st.error ?? (err instanceof Error ? err.message : String(err));
        break;
      }
    }
  }
  if (!failedStep) {
    failedStep = state?.currentStep ?? "unknown";
    failedError = err instanceof Error ? err.message : String(err);
  }
  console.error(`FAILED at step: ${failedStep}`);
  console.error(`Error: ${failedError}`);
  if (failedStep === "deploy_pages") {
    try {
      const stat = Bun.file(join(RELEASES, "cco-web.mjs"));
      console.error(`cco-web.mjs size: ${stat.size} bytes (if ~2KB, rebuild web release artifacts)`);
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
}

const state = await loadProvisionState(store, sessionId);
if (!state) {
  console.error("Provision state missing after pipeline");
  process.exit(1);
}

console.log("\n=== Step status ===");
for (const step of PROVISION_STEP_ORDER) {
  const st = state.stepStatus[step];
  if (!st || st.status === "pending") continue;
  const line = `${step}: ${st.status}${st.error ? ` (${st.error})` : ""}`;
  console.log(line);
}

const r = state.resources;
console.log("\n=== Created resources ===");
console.log(JSON.stringify({
  accountId: r.accountId,
  zoneId: r.zoneId,
  d1DatabaseId: r.d1DatabaseId,
  r2BucketName: r.r2BucketName,
  r2AccessKeyId: r.r2AccessKeyId ? "(set)" : undefined,
  kvPresenceNamespaceId: r.kvPresenceNamespaceId,
  kvDeployNamespaceId: r.kvDeployNamespaceId,
  pushQueueId: r.pushQueueId,
  chatHostname: r.chatHostname,
  apiHostname: r.apiHostname,
  workerScriptNames: r.workerScriptNames,
  pagesProjectName: r.pagesProjectName,
  webWorkerScriptName: r.webWorkerScriptName,
  realtimeKitAppId: r.realtimeKitAppId,
  realtimeKitPresetHost: r.realtimeKitPresetHost ? "(set)" : undefined,
}, null, 2));

console.log("\nProvision-only complete (skipped Postgres import and finalize_org handler).");
