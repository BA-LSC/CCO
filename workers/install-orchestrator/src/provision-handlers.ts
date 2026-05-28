import {
  applyD1MigrationStatements,
  CCO_PUSH_QUEUE_NAME,
  CCO_WEB_SCRIPT_NAME,
  createProvisionWorkerHandlers,
  createR2AccessKey,
  deployCcoWebWorker,
  ensureD1Database,
  ensureDnsRecord,
  ensureKvNamespace,
  ensureQueue,
  ensureR2AttachmentCacheRule,
  ensureR2Bucket,
  ensureR2BucketCors,
  ensureWorkerCustomDomain,
  ensureWorkerRoute,
  fetchWebReleaseManifest,
  listCloudflareAccounts,
  provisionRealtimeKitFromApiToken,
  upsertStoreSecret,
  CCO_STORE_SECRET,
  apiInternalUrl,
  type CcoWorkerScriptName,
  type ProvisionPipelineContext,
  type ProvisionSessionState,
  type ProvisionStepHandlers,
  type WebAssetManifest,
} from "@cco/cloudflare-provision";

const CCO_D1_DATABASE_NAME = "cco";
const CCO_R2_BUCKET_PREFIX = "cco-uploads";
const CCO_KV_PRESENCE_TITLE = "cco-presence";
const CCO_KV_DEPLOY_TITLE = "cco-deploy";
const CCO_R2_ACCESS_KEY_NAME = "cco-uploads-key";

function resolveAccountId(
  state: ProvisionSessionState,
  context: ProvisionPipelineContext,
): string {
  const accountId = context.accountId ?? state.resources.accountId;
  if (!accountId) {
    throw new Error("Cloudflare account ID is required");
  }
  return accountId;
}

function resolveZoneId(
  state: ProvisionSessionState,
  context: ProvisionPipelineContext,
): string {
  const zoneId = context.zoneId ?? state.resources.zoneId;
  if (!zoneId) {
    throw new Error("Cloudflare zone ID is required");
  }
  return zoneId;
}

function defaultR2BucketName(accountId: string): string {
  return `${CCO_R2_BUCKET_PREFIX}-${accountId.slice(0, 8).toLowerCase()}`;
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith("--"));
}

export type CreateInstallProvisionHandlersOptions = {
  readWorkerBundle: (scriptName: CcoWorkerScriptName) => Promise<ArrayBuffer>;
  fetchD1BaselineSql?: () => Promise<string | null>;
  releasesBaseUrl?: string;
  fetchWebManifest?: () => Promise<WebAssetManifest>;
};

function resolveReleasesBaseUrl(options: CreateInstallProvisionHandlersOptions): string {
  const base = options.releasesBaseUrl?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "Release artifacts are not configured. Set CCO_RELEASES_BASE_URL on the install orchestrator.",
    );
  }
  return base;
}

export async function createInstallProvisionHandlers(
  options: CreateInstallProvisionHandlersOptions,
): Promise<ProvisionStepHandlers> {
  const workerHandlers = await createProvisionWorkerHandlers({
    readBundle: options.readWorkerBundle,
  });

  const createD1Step: ProvisionStepHandlers["create_d1"] = async (state, context) => {
    const accountId = resolveAccountId(state, context);
    if (!context.accountId) {
      const accounts = await listCloudflareAccounts(context.apiToken);
      const chosen = accounts[0];
      if (!chosen) throw new Error("No Cloudflare accounts found for this token");
      context.accountId = chosen.id;
      state.resources.accountId = chosen.id;
    }
    const d1 = await ensureD1Database(accountId, context.apiToken, CCO_D1_DATABASE_NAME);
    state.resources.d1DatabaseId = d1.uuid;
    state.resources.accountId = accountId;
  };

  const migrateD1Step: ProvisionStepHandlers["migrate_d1"] = async (state, context) => {
    const accountId = resolveAccountId(state, context);
    const databaseId = state.resources.d1DatabaseId;
    if (!databaseId) {
      throw new Error("D1 database must exist before migrate_d1");
    }

    const baselineSql = options.fetchD1BaselineSql ? await options.fetchD1BaselineSql() : null;
    if (!baselineSql?.trim()) {
      return;
    }

    await applyD1MigrationStatements(
      accountId,
      context.apiToken,
      databaseId,
      splitSqlStatements(baselineSql),
    );
  };

  const createR2Step: ProvisionStepHandlers["create_r2"] = async (state, context) => {
    const accountId = resolveAccountId(state, context);
    const bucketName = defaultR2BucketName(accountId);
    const r2 = await ensureR2Bucket(accountId, context.apiToken, bucketName);
    state.resources.r2BucketName = r2.name;

    const accessKey = await createR2AccessKey(
      accountId,
      context.apiToken,
      r2.name,
      CCO_R2_ACCESS_KEY_NAME,
    ).catch((err) => {
      console.warn(
        "[provision] R2 temp access credentials unavailable; uploads will use Worker R2 binding only:",
        err instanceof Error ? err.message : err,
      );
      return null;
    });
    if (accessKey) {
      state.resources.r2AccessKeyId = accessKey.access_key_id;
      state.resources.r2SecretAccessKey = accessKey.secret_access_key;
    }

    const chatHostname = context.chatHostname ?? state.resources.chatHostname;
    if (chatHostname) {
      await ensureR2BucketCors(accountId, context.apiToken, r2.name, [chatHostname]).catch(
        (err) => {
          console.warn(
            "[provision] R2 upload CORS configuration skipped:",
            err instanceof Error ? err.message : err,
          );
        },
      );
    }
  };

  const createKvStep: ProvisionStepHandlers["create_kv"] = async (state, context) => {
    const accountId = resolveAccountId(state, context);
    const presence = await ensureKvNamespace(accountId, context.apiToken, CCO_KV_PRESENCE_TITLE);
    const deploy = await ensureKvNamespace(accountId, context.apiToken, CCO_KV_DEPLOY_TITLE);
    state.resources.kvPresenceNamespaceId = presence.id;
    state.resources.kvDeployNamespaceId = deploy.id;
  };

  const createQueueStep: ProvisionStepHandlers["create_queue"] = async (state, context) => {
    const accountId = resolveAccountId(state, context);
    const queue = await ensureQueue(accountId, context.apiToken, CCO_PUSH_QUEUE_NAME);
    state.resources.pushQueueId = queue.queue_id;
  };

  const deployPagesStep: ProvisionStepHandlers["deploy_pages"] = async (state, context) => {
    const chatHostname = context.chatHostname ?? state.resources.chatHostname;
    const apiHostname = context.apiHostname ?? state.resources.apiHostname;
    const secrets = state.secrets;
    if (!chatHostname || !apiHostname || !secrets) {
      throw new Error("Hostnames and secrets are required before deploy_pages");
    }

    const accountId = resolveAccountId(state, context);
    const secretsStoreId = state.resources.secretsStoreId;
    if (!secretsStoreId) {
      throw new Error("Secrets Store must exist before deploy_pages");
    }

    const releasesBase = resolveReleasesBaseUrl(options);
    const assetsManifest = options.fetchWebManifest
      ? await options.fetchWebManifest()
      : await fetchWebReleaseManifest(`${releasesBase}/cco-web-manifest.json`);

    await deployCcoWebWorker({
      accountId,
      apiToken: context.apiToken,
      chatHostname,
      apiHostname,
      secretsStoreId,
      kvDeployNamespaceId: state.resources.kvDeployNamespaceId,
      workerModuleUrl: `${releasesBase}/cco-web.mjs`,
      assetsBaseUrl: `${releasesBase}/assets`,
      assetsManifest,
    });

    const zoneId = resolveZoneId(state, context);
    try {
      await ensureWorkerCustomDomain(accountId, context.apiToken, {
        hostname: chatHostname,
        service: CCO_WEB_SCRIPT_NAME,
      });
    } catch (err) {
      console.warn(
        "[provision] Worker custom domain API unavailable; using zone route for chat hostname:",
        err instanceof Error ? err.message : err,
      );
      await ensureWorkerRoute(zoneId, context.apiToken, `${chatHostname}/*`, CCO_WEB_SCRIPT_NAME);
    }

    state.resources.webWorkerScriptName = CCO_WEB_SCRIPT_NAME;
    state.resources.chatHostname = chatHostname;
    state.resources.apiHostname = apiHostname;
  };

  const configureDnsStep: ProvisionStepHandlers["configure_dns"] = async (state, context) => {
    const zoneId = resolveZoneId(state, context);
    const apiHostname = context.apiHostname ?? state.resources.apiHostname;
    const chatHostname = context.chatHostname ?? state.resources.chatHostname;
    if (!apiHostname) {
      throw new Error("API hostname is required before configure_dns");
    }

    for (const hostname of [apiHostname, chatHostname].filter(
      (hostname): hostname is string => Boolean(hostname),
    )) {
      await ensureDnsRecord(zoneId, context.apiToken, {
        type: "AAAA",
        name: hostname,
        content: "100::",
        proxied: true,
      });
    }

    state.resources.zoneId = zoneId;
    state.resources.chatHostname = context.chatHostname ?? state.resources.chatHostname;
    state.resources.apiHostname = apiHostname;
  };

  const provisionRealtimeStep: ProvisionStepHandlers["provision_realtimekit"] = async (
    state,
    context,
  ) => {
    const accountId = resolveAccountId(state, context);
    const result = await provisionRealtimeKitFromApiToken({
      apiToken: context.apiToken,
      organizationName: state.churchName,
      existingAccountId: accountId,
      autoCreateApp: true,
    });

    state.resources.accountId = result.accountId;
    state.resources.realtimeKitAppId = result.appId;
    if (result.presets) {
      state.resources.realtimeKitPresetHost = result.presets.host;
      state.resources.realtimeKitPresetMember = result.presets.member;
      state.resources.realtimeKitPresetGuest = result.presets.guest;
    }
  };

  const configureCacheRulesStep: ProvisionStepHandlers["configure_cache_rules"] = async (
    state,
    context,
  ) => {
    const zoneId = resolveZoneId(state, context);
    const apiHostname = context.apiHostname ?? state.resources.apiHostname;
    if (!apiHostname) {
      throw new Error("API hostname is required before configure_cache_rules");
    }
    await ensureR2AttachmentCacheRule(zoneId, context.apiToken);

    const chatHostname = context.chatHostname ?? state.resources.chatHostname;
    const bucketName = state.resources.r2BucketName;
    if (chatHostname && bucketName) {
      await ensureR2BucketCors(resolveAccountId(state, context), context.apiToken, bucketName, [
        chatHostname,
      ]).catch((err) => {
        console.warn(
          "[provision] R2 upload CORS configuration skipped:",
          err instanceof Error ? err.message : err,
        );
      });
    }
  };

  const finalizeOrgStep: ProvisionStepHandlers["finalize_org"] = async (state, context) => {
    state.resources.chatHostname = context.chatHostname ?? state.resources.chatHostname;
    state.resources.apiHostname = context.apiHostname ?? state.resources.apiHostname;
    state.resources.accountId = context.accountId ?? state.resources.accountId;

    const apiHostname = state.resources.apiHostname;
    const chatHostname = state.resources.chatHostname;
    const secrets = state.secrets;
    const secretsStoreId = state.resources.secretsStoreId;
    if (!apiHostname || !chatHostname || !secrets || !secretsStoreId) {
      throw new Error("Hostnames, secrets, and Secrets Store are required before finalize_org");
    }

    const accountId = resolveAccountId(state, context);
    await upsertStoreSecret(
      accountId,
      context.apiToken,
      secretsStoreId,
      CCO_STORE_SECRET.CLOUDFLARE_API_TOKEN,
      context.apiToken,
    );
    if (state.resources.r2AccessKeyId && state.resources.r2SecretAccessKey) {
      await upsertStoreSecret(
        accountId,
        context.apiToken,
        secretsStoreId,
        CCO_STORE_SECRET.R2_ACCESS_KEY_ID,
        state.resources.r2AccessKeyId,
      );
      await upsertStoreSecret(
        accountId,
        context.apiToken,
        secretsStoreId,
        CCO_STORE_SECRET.R2_SECRET_ACCESS_KEY,
        state.resources.r2SecretAccessKey,
      );
    }

    const handoffUrl = apiInternalUrl(apiHostname, "/v1/setup/install-handoff");
    const res = await fetch(handoffUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-setup-bootstrap": secrets.CF_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        churchName: state.churchName,
        chatHostname,
        apiHostname,
        cloudflareAccountId: state.resources.accountId,
        cloudflareSecretsStoreId: secretsStoreId,
        cloudflareApiTokenConfigured: true,
        cloudflareR2BucketName: state.resources.r2BucketName,
        cloudflareR2AccessKeyId: state.resources.r2AccessKeyId,
        cloudflareR2SecretAccessKey: state.resources.r2SecretAccessKey,
        cloudflareR2AccessKeyConfigured: Boolean(state.resources.r2AccessKeyId),
        cloudflareR2SecretAccessKeyConfigured: Boolean(state.resources.r2SecretAccessKey),
        cloudflareKvPresenceNamespaceId: state.resources.kvPresenceNamespaceId,
        cloudflareKvDeployNamespaceId: state.resources.kvDeployNamespaceId,
        cloudflarePushQueueId: state.resources.pushQueueId,
        realtimeKitAppId: state.resources.realtimeKitAppId,
        realtimeKitPresetHost: state.resources.realtimeKitPresetHost,
        realtimeKitPresetMember: state.resources.realtimeKitPresetMember,
        realtimeKitPresetGuest: state.resources.realtimeKitPresetGuest,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Install handoff failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
  };

  return {
    create_d1: createD1Step,
    migrate_d1: migrateD1Step,
    create_r2: createR2Step,
    create_kv: createKvStep,
    create_queue: createQueueStep,
    deploy_workers: workerHandlers.deploy_workers,
    deploy_pages: deployPagesStep,
    configure_dns: configureDnsStep,
    configure_routes: workerHandlers.configure_routes,
    provision_realtimekit: provisionRealtimeStep,
    configure_cache_rules: configureCacheRulesStep,
    finalize_org: finalizeOrgStep,
  };
}

export function createWorkerBundleLoader(
  bundlesBaseUrl: string | undefined,
): (scriptName: CcoWorkerScriptName) => Promise<ArrayBuffer> {
  const base = bundlesBaseUrl?.trim().replace(/\/+$/, "");
  return async (scriptName) => {
    if (!base) {
      throw new Error(
        "Worker bundles are not configured. Set CCO_WORKER_BUNDLES_BASE_URL on the install orchestrator.",
      );
    }
    const res = await fetch(`${base}/${scriptName}.mjs`);
    if (!res.ok) {
      throw new Error(`Failed to load worker bundle ${scriptName}: HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  };
}

export function createReleasesLoader(releasesBaseUrl: string | undefined) {
  const base = releasesBaseUrl?.trim().replace(/\/+$/, "");
  return {
    releasesBaseUrl: base,
    fetchWebManifest: base
      ? () => fetchWebReleaseManifest(`${base}/cco-web-manifest.json`)
      : undefined,
  };
}
