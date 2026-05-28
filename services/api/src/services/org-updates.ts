import {
  AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES,
  CCO_DEFAULT_GIT_REPO_URL,
  isUpdateAvailable,
  normalizeAutoUpdateCheckIntervalMinutes,
  type ReleaseIndex,
} from "@cco/shared";
import {
  applyD1MigrationStatements,
  deployAllProvisionWorkers,
  deployCcoWebWorker,
  ensureD1Database,
  ensureR2BucketCors,
  resolveR2UploadChatOrigins,
  fetchWebReleaseManifest,
  verifyCloudflareUpdateApplyPermissions,
  type CcoWorkerScriptName,
  type ProvisionSecrets,
} from "@cco/cloudflare-provision";
import { getD1IncrementalMigrationFilenames } from "@cco/db";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { isCloudflareRuntime } from "../runtime/worker-context";
import { readDeployLastError, setDeployDraining, setDeployLastError } from "../lib/deploy-status";
import { fetchGitReleaseIndex, resolveOrgGitRepoUrl } from "./git-release-index";
import { getConfiguredOrganization } from "./org-oauth";
import {
  migrateOrganizationSecretsToStore,
  isCloudflareApiTokenConfigured,
  organizationHasPendingSecretsStoreMigration,
  resolveApplyCloudflareApiToken,
} from "./org-secrets";
import { ensureCloudflareOrganizationColumns } from "./org-schema-capabilities";
import { invalidateOrgContextCache } from "./org-context-cache";

const D1_UPDATE_COLUMN_STATEMENTS = [
  `ALTER TABLE "organizations" ADD COLUMN "installed_release_version" TEXT`,
  `ALTER TABLE "organizations" ADD COLUMN "auto_update_enabled" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "organizations" ADD COLUMN "last_update_check_at" INTEGER`,
  `ALTER TABLE "organizations" ADD COLUMN "git_repo_url" TEXT`,
  `ALTER TABLE "organizations" ADD COLUMN "auto_update_check_interval_minutes" INTEGER NOT NULL DEFAULT 360`,
] as const;

function splitSqlStatements(sqlText: string): string[] {
  return sqlText
    .split(/;\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith("--"));
}

export async function ensureOrgUpdateSettingsColumns(): Promise<void> {
  await ensureCloudflareOrganizationColumns();
  if (!isCloudflareRuntime()) return;
  for (const statement of D1_UPDATE_COLUMN_STATEMENTS) {
    try {
      await db.execute(sql.raw(statement));
    } catch {
      // Column may already exist after 0001 migration.
    }
  }
}

export type UpdatePlatform = "cloudflare" | "vps" | "unknown";

export type UpdatesStatus = {
  platform: UpdatePlatform;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  autoUpdateEnabled: boolean;
  autoUpdateCheckIntervalMinutes: number;
  lastUpdateCheckAt: string | null;
  latestPublishedAt: string | null;
  releasesBaseUrl: string | null;
  gitRepoUrl: string;
  lastApplyError: string | null;
  canApply: boolean;
  applyBlockedReason: string | null;
  /** False when the apply token (Secrets Store binding) fails Cloudflare preflight. */
  cloudflareApiTokenValid: boolean | null;
  cloudflareApiTokenError: string | null;
};

export type CloudflareApplyTokenHealth = {
  valid: boolean;
  error: string | null;
};

/** Preflight the token Apply update will use (binding, override, or legacy D1 enc). */
export async function checkCloudflareApplyTokenHealth(
  org: NonNullable<Awaited<ReturnType<typeof getConfiguredOrganization>>>,
  apiTokenOverride?: string,
): Promise<CloudflareApplyTokenHealth> {
  if (!isCloudflareApiTokenConfigured(org)) {
    return { valid: false, error: "Cloudflare API token is not configured." };
  }
  if (!org.cloudflareAccountId?.trim()) {
    return { valid: false, error: "Cloudflare account is not linked to this organization." };
  }

  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    return {
      valid: false,
      error: "Could not resolve chat/API hostnames from organization URLs.",
    };
  }

  const apiToken = resolveApplyCloudflareApiToken(org, apiTokenOverride);
  if (!apiToken) {
    return {
      valid: false,
      error:
        "Cloudflare API token is missing. Paste a new token under Cloudflare in Admin Settings.",
    };
  }

  try {
    await verifyCloudflareUpdateApplyPermissions({
      accountId: org.cloudflareAccountId,
      apiToken,
      chatHostname: hostnames.chatHostname,
      apiHostname: hostnames.apiHostname,
    });
    return { valid: true, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cloudflare API token verification failed";
    return { valid: false, error: message };
  }
}

export type CloudflareReleaseUpdateJob = {
  orgId: string;
  accountId: string;
  apiToken: string;
  secretsStoreId: string;
  resources: {
    accountId: string;
    d1DatabaseId: string;
    r2BucketName: string;
    kvPresenceNamespaceId: string;
    kvDeployNamespaceId: string;
    pushQueueId: string;
    chatHostname: string;
    apiHostname: string;
  };
  releasesBase: string;
  targetVersion: string;
  readBundle: (scriptName: CcoWorkerScriptName) => Promise<ArrayBuffer>;
};

function resolveRunningBuildVersion(): string | null {
  const fromEnv =
    process.env.GITHUB_SHA?.trim() ||
    process.env.CCO_BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return fromEnv && fromEnv !== "dev" ? fromEnv : null;
}

function resolveInstalledVersion(org: {
  installedReleaseVersion: string | null;
}): string | null {
  return org.installedReleaseVersion?.trim() || resolveRunningBuildVersion();
}

function resolveReleasesBaseUrl(index: ReleaseIndex): string {
  return index.releasesBaseUrl.replace(/\/+$/, "");
}

async function fetchReleaseIndexForOrg(gitRepoUrl: string | null | undefined): Promise<ReleaseIndex> {
  return fetchGitReleaseIndex(gitRepoUrl);
}

export function resolveOrgHostnames(org: {
  pcoWebRedirectUri: string | null;
  pcoWebhookUrl: string | null;
}): { chatHostname: string; apiHostname: string } | null {
  const signIn = org.pcoWebRedirectUri?.trim();
  const webhook = org.pcoWebhookUrl?.trim();
  if (!signIn || !webhook) return null;
  try {
    return {
      chatHostname: new URL(signIn).hostname,
      apiHostname: new URL(webhook).hostname,
    };
  } catch {
    return null;
  }
}

export function resolveUpdatePlatform(org: {
  cloudflarePlatformProvisionedAt: Date | null;
  cloudflareApiTokenEnc: string | null;
  cloudflareApiTokenConfigured: boolean | null;
  cloudflareAccountId: string | null;
}): UpdatePlatform {
  if (
    org.cloudflarePlatformProvisionedAt &&
    isCloudflareApiTokenConfigured(org) &&
    org.cloudflareAccountId
  ) {
    return "cloudflare";
  }
  if (isCloudflareRuntime()) return "cloudflare";
  if (process.env.CCO_DEPLOY_TARGET === "cloudflare") return "cloudflare";
  if (process.env.DATABASE_URL?.trim()) return "vps";
  return "unknown";
}

export async function fetchReleaseIndex(gitRepoUrl?: string | null): Promise<ReleaseIndex> {
  return fetchReleaseIndexForOrg(gitRepoUrl);
}

type UpdatesApplyGating = {
  canApply: boolean;
  applyBlockedReason: string | null;
  cloudflareApiTokenValid: boolean | null;
  cloudflareApiTokenError: string | null;
};

function resolveUpdatesApplyGating(
  org: NonNullable<Awaited<ReturnType<typeof getConfiguredOrganization>>>,
  platform: UpdatePlatform,
  updateAvailable: boolean,
  lastApplyError: string | null,
  checkError: string | null,
  tokenHealth?: CloudflareApplyTokenHealth | { valid: boolean | null; error: string | null },
): UpdatesApplyGating {
  let canApply = platform === "cloudflare";
  let applyBlockedReason: string | null = null;

  if (platform === "vps") {
    canApply = false;
    applyBlockedReason =
      "VPS deployments update via git pull on the server (./deploy/update.sh), not from Admin Updates.";
  } else if (platform !== "cloudflare") {
    canApply = false;
    applyBlockedReason = "Update apply is only supported for BYO Cloudflare installs.";
  } else if (!isCloudflareApiTokenConfigured(org)) {
    canApply = false;
    applyBlockedReason = "Cloudflare API token is not configured.";
  } else if (!resolveOrgHostnames(org)) {
    canApply = false;
    applyBlockedReason = "Could not resolve chat/API hostnames from organization URLs.";
  } else if (checkError) {
    canApply = false;
    applyBlockedReason = checkError;
  } else if (!updateAvailable && !lastApplyError) {
    canApply = false;
    applyBlockedReason = "Already on the latest release.";
  }

  let cloudflareApiTokenValid: boolean | null = null;
  let cloudflareApiTokenError: string | null = null;
  if (platform === "cloudflare" && isCloudflareApiTokenConfigured(org)) {
    if (tokenHealth) {
      cloudflareApiTokenValid = tokenHealth.valid;
      cloudflareApiTokenError = tokenHealth.error;
    }
    if (tokenHealth && tokenHealth.valid === false) {
      canApply = false;
      applyBlockedReason =
        tokenHealth.error ??
        "Cloudflare API token is invalid. Paste a new token under Cloudflare.";
    }
  }

  return { canApply, applyBlockedReason, cloudflareApiTokenValid, cloudflareApiTokenError };
}

/** DB-backed updates snapshot for Admin Settings page load (no Cloudflare token preflight). */
export async function getCachedUpdatesStatus(
  org: NonNullable<Awaited<ReturnType<typeof getConfiguredOrganization>>>,
  tokenHealth?: CloudflareApplyTokenHealth | { valid: boolean | null; error: string | null },
): Promise<UpdatesStatus> {
  const platform = resolveUpdatePlatform(org);
  const currentVersion = resolveInstalledVersion(org);
  const gitRepoUrl = resolveOrgGitRepoUrl(org.gitRepoUrl);
  const lastApplyError = await readDeployLastError();
  let latestIndex: ReleaseIndex | null = null;
  let checkError: string | null = null;
  try {
    latestIndex = await fetchReleaseIndexForOrg(gitRepoUrl);
  } catch (err) {
    checkError = err instanceof Error ? err.message : "Release check failed";
  }
  const latestVersion = latestIndex?.version ?? null;
  const updateAvailable =
    latestVersion != null && isUpdateAvailable(currentVersion, latestVersion);
  const gating = resolveUpdatesApplyGating(
    org,
    platform,
    updateAvailable,
    lastApplyError,
    checkError,
    tokenHealth,
  );

  return {
    platform,
    currentVersion,
    latestVersion,
    updateAvailable,
    autoUpdateEnabled: org.autoUpdateEnabled ?? false,
    autoUpdateCheckIntervalMinutes: normalizeAutoUpdateCheckIntervalMinutes(
      org.autoUpdateCheckIntervalMinutes,
    ),
    lastUpdateCheckAt: org.lastUpdateCheckAt?.toISOString() ?? null,
    latestPublishedAt: latestIndex?.publishedAt ?? null,
    releasesBaseUrl: latestIndex ? resolveReleasesBaseUrl(latestIndex) : null,
    gitRepoUrl,
    lastApplyError,
    ...gating,
  };
}

export async function getUpdatesStatus(options?: {
  forceCheck?: boolean;
}): Promise<UpdatesStatus> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) {
    throw new Error("Organization not found");
  }

  const platform = resolveUpdatePlatform(org);
  const currentVersion = resolveInstalledVersion(org);
  let latestIndex: ReleaseIndex | null = null;
  let checkError: string | null = null;

  const gitRepoUrl = resolveOrgGitRepoUrl(org.gitRepoUrl);
  const lastApplyError = await readDeployLastError();
  let lastUpdateCheckAt = org.lastUpdateCheckAt;

  if (options?.forceCheck || !org.lastUpdateCheckAt) {
    try {
      latestIndex = await fetchReleaseIndexForOrg(gitRepoUrl);
    } catch (err) {
      checkError = err instanceof Error ? err.message : "Release check failed";
    }
    const checkedAt = new Date();
    await db
      .update(organizations)
      .set({ lastUpdateCheckAt: checkedAt })
      .where(eq(organizations.id, org.id));
    lastUpdateCheckAt = checkedAt;
    invalidateOrgContextCache();
  } else {
    try {
      latestIndex = await fetchReleaseIndexForOrg(gitRepoUrl);
    } catch {
      // Stale check data is acceptable when not forcing.
    }
  }

  const latestVersion = latestIndex?.version ?? null;
  const updateAvailable = latestVersion
    ? isUpdateAvailable(currentVersion, latestVersion)
    : false;

  const gating = resolveUpdatesApplyGating(
    org,
    platform,
    updateAvailable,
    lastApplyError,
    checkError,
    platform === "cloudflare" && isCloudflareApiTokenConfigured(org)
      ? await checkCloudflareApplyTokenHealth(org)
      : undefined,
  );

  return {
    platform,
    currentVersion,
    latestVersion,
    updateAvailable,
    autoUpdateEnabled: org.autoUpdateEnabled ?? false,
    autoUpdateCheckIntervalMinutes: normalizeAutoUpdateCheckIntervalMinutes(
      org.autoUpdateCheckIntervalMinutes,
    ),
    lastUpdateCheckAt: lastUpdateCheckAt?.toISOString() ?? null,
    latestPublishedAt: latestIndex?.publishedAt ?? null,
    releasesBaseUrl: latestIndex ? resolveReleasesBaseUrl(latestIndex) : null,
    gitRepoUrl,
    lastApplyError,
    ...gating,
  };
}

function requireProvisionSecrets(): ProvisionSecrets {
  const SESSION_SECRET = process.env.SESSION_SECRET?.trim();
  const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const CF_INTERNAL_SECRET = process.env.CF_INTERNAL_SECRET?.trim();
  if (!SESSION_SECRET || !TOKEN_ENCRYPTION_KEY || !CF_INTERNAL_SECRET) {
    throw new Error("Server secrets are not configured for worker redeploy");
  }
  return { SESSION_SECRET, TOKEN_ENCRYPTION_KEY, CF_INTERNAL_SECRET };
}

function createRemoteBundleLoader(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return async (scriptName: CcoWorkerScriptName) => {
    const res = await fetch(`${base}/${scriptName}.mjs`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${scriptName} bundle: HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  };
}

async function applyIncrementalD1Migrations(job: CloudflareReleaseUpdateJob): Promise<void> {
  const { accountId, apiToken, resources } = job;
  for (const filename of getD1IncrementalMigrationFilenames()) {
    const res = await fetch(`${job.releasesBase}/${filename}`);
    if (res.status === 404) {
      // Older release artifacts may predate incremental migration files.
      continue;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch D1 migration ${filename}: HTTP ${res.status}`);
    }
    const sqlText = await res.text();
    for (const statement of splitSqlStatements(sqlText)) {
      try {
        await applyD1MigrationStatements(
          accountId,
          apiToken,
          resources.d1DatabaseId,
          [statement],
        );
      } catch {
        // Column may already exist after a prior apply.
      }
    }
  }
}

export async function prepareCloudflareReleaseUpdate(options?: {
  apiTokenOverride?: string;
}): Promise<CloudflareReleaseUpdateJob> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) throw new Error("Organization not found");
  if (resolveUpdatePlatform(org) !== "cloudflare") {
    throw new Error("Apply update is only supported for BYO Cloudflare installs");
  }
  if (!isCloudflareApiTokenConfigured(org) || !org.cloudflareAccountId) {
    throw new Error("Cloudflare credentials are not configured");
  }

  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    throw new Error("Could not resolve chat/API hostnames from organization URLs");
  }

  const gitRepoUrl = resolveOrgGitRepoUrl(org.gitRepoUrl);
  const releaseIndex = await fetchReleaseIndexForOrg(gitRepoUrl);
  const releasesBase = resolveReleasesBaseUrl(releaseIndex);
  const currentVersion = resolveInstalledVersion(org);
  const lastApplyError = await readDeployLastError();
  if (
    !isUpdateAvailable(currentVersion, releaseIndex.version) &&
    !lastApplyError
  ) {
    throw new Error("Already on the latest release");
  }

  const platformSecrets = requireProvisionSecrets();
  let secretsStoreId = org.cloudflareSecretsStoreId?.trim() ?? "";

  const apiToken = resolveApplyCloudflareApiToken(org, options?.apiTokenOverride);

  if (!apiToken) {
    throw new Error("Cloudflare API token is not available for apply update");
  }

  const accountId = org.cloudflareAccountId;

  if (!secretsStoreId || organizationHasPendingSecretsStoreMigration(org)) {
    secretsStoreId = await migrateOrganizationSecretsToStore({
      organizationId: org.id,
      accountId,
      apiToken,
      platformSecrets,
    });
  }

  await verifyCloudflareUpdateApplyPermissions({
    accountId,
    apiToken,
    chatHostname: hostnames.chatHostname,
    apiHostname: hostnames.apiHostname,
  });

  const readBundle = createRemoteBundleLoader(releasesBase);
  try {
    await setDeployLastError(null);
  } catch {
    // Old workers may fail KV clear (e.g. expiration_ttl=1); apply must still proceed.
  }

  const d1 = await ensureD1Database(accountId, apiToken, "cco");
  const resources = {
    accountId,
    d1DatabaseId: d1.uuid,
    r2BucketName: org.cloudflareR2BucketName ?? "",
    kvPresenceNamespaceId: org.cloudflareKvPresenceNamespaceId ?? "",
    kvDeployNamespaceId: org.cloudflareKvDeployNamespaceId ?? "",
    pushQueueId: org.cloudflarePushQueueId ?? "",
    chatHostname: hostnames.chatHostname,
    apiHostname: hostnames.apiHostname,
  };

  const missing = [
    resources.r2BucketName,
    resources.kvPresenceNamespaceId,
    resources.kvDeployNamespaceId,
    resources.pushQueueId,
  ].some((value) => !value);
  if (missing) {
    throw new Error("Cloudflare platform resources are incomplete; re-run platform provisioning");
  }

  return {
    orgId: org.id,
    accountId,
    apiToken,
    secretsStoreId,
    resources,
    releasesBase,
    targetVersion: releaseIndex.version,
    readBundle,
  };
}

export async function executeCloudflareReleaseUpdate(
  job: CloudflareReleaseUpdateJob,
): Promise<{ appliedVersion: string; deployedWorkers: string[] }> {
  await setDeployDraining(true);
  try {
    await ensureR2BucketCors(
      job.accountId,
      job.apiToken,
      job.resources.r2BucketName,
      resolveR2UploadChatOrigins({
        webUrl: `https://${job.resources.chatHostname}`,
        signInRedirectUri: `https://${job.resources.chatHostname}/api/auth/pco/callback`,
      }),
    ).catch((err) => {
      console.warn(
        "[org-updates] R2 upload CORS configuration skipped:",
        err instanceof Error ? err.message : err,
      );
    });

    await applyIncrementalD1Migrations(job);

    const deployedWorkers = await deployAllProvisionWorkers({
      accountId: job.accountId,
      apiToken: job.apiToken,
      resources: job.resources,
      secretsStoreId: job.secretsStoreId,
      apiHostname: job.resources.apiHostname,
      readBundle: job.readBundle,
    });

    const assetsManifest = await fetchWebReleaseManifest(
      `${job.releasesBase}/cco-web-manifest.json`,
    );
    await deployCcoWebWorker({
      accountId: job.accountId,
      apiToken: job.apiToken,
      chatHostname: job.resources.chatHostname,
      apiHostname: job.resources.apiHostname,
      secretsStoreId: job.secretsStoreId,
      workerModuleUrl: `${job.releasesBase}/cco-web.mjs`,
      assetsBaseUrl: `${job.releasesBase}/assets/`,
      assetsManifest,
      releaseVersion: job.targetVersion,
    });

    await db
      .update(organizations)
      .set({
        installedReleaseVersion: job.targetVersion,
        lastUpdateCheckAt: new Date(),
      })
      .where(eq(organizations.id, job.orgId));
    invalidateOrgContextCache();
    try {
      await setDeployLastError(null);
    } catch {
      // Non-blocking: successful deploy should not fail on stale KV clear behavior.
    }

    return { appliedVersion: job.targetVersion, deployedWorkers };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply update failed";
    await setDeployLastError(message);
    throw err;
  } finally {
    await setDeployDraining(false);
  }
}

export async function startCloudflareReleaseUpdate(options?: {
  apiTokenOverride?: string;
}): Promise<{
  job: CloudflareReleaseUpdateJob;
  targetVersion: string;
}> {
  await setDeployDraining(true);
  try {
    const job = await prepareCloudflareReleaseUpdate(options);
    return { job, targetVersion: job.targetVersion };
  } catch (err) {
    await setDeployDraining(false);
    throw err;
  }
}

export async function applyCloudflareReleaseUpdate(options?: {
  apiTokenOverride?: string;
}): Promise<{
  appliedVersion: string;
  deployedWorkers: string[];
}> {
  await setDeployDraining(true);
  try {
    const job = await prepareCloudflareReleaseUpdate(options);
    return await executeCloudflareReleaseUpdate(job);
  } catch (err) {
    await setDeployDraining(false);
    throw err;
  }
}

export async function setGitRepoUrl(gitRepoUrl: string): Promise<void> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) throw new Error("Organization not found");

  const normalized = resolveOrgGitRepoUrl(gitRepoUrl);
  await db
    .update(organizations)
    .set({
      gitRepoUrl: normalized === CCO_DEFAULT_GIT_REPO_URL ? null : normalized,
    })
    .where(eq(organizations.id, org.id));
  invalidateOrgContextCache();
}

export async function setAutoUpdateEnabled(enabled: boolean): Promise<void> {
  await setAutoUpdateSettings({ autoUpdateEnabled: enabled });
}

export async function setAutoUpdateCheckIntervalMinutes(minutes: number): Promise<void> {
  await setAutoUpdateSettings({ autoUpdateCheckIntervalMinutes: minutes });
}

export async function setAutoUpdateSettings(options: {
  autoUpdateEnabled?: boolean;
  autoUpdateCheckIntervalMinutes?: number;
}): Promise<void> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) throw new Error("Organization not found");

  const patch: {
    autoUpdateEnabled?: boolean;
    autoUpdateCheckIntervalMinutes?: number;
  } = {};

  if (options.autoUpdateEnabled !== undefined) {
    patch.autoUpdateEnabled = options.autoUpdateEnabled;
  }
  if (options.autoUpdateCheckIntervalMinutes !== undefined) {
    if (
      !Number.isFinite(options.autoUpdateCheckIntervalMinutes) ||
      options.autoUpdateCheckIntervalMinutes < AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES
    ) {
      throw new Error(
        `Check interval must be at least ${AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES} minutes`,
      );
    }
    patch.autoUpdateCheckIntervalMinutes = Math.floor(options.autoUpdateCheckIntervalMinutes);
  }

  if (Object.keys(patch).length === 0) return;

  await db.update(organizations).set(patch).where(eq(organizations.id, org.id));
  invalidateOrgContextCache();
}

/** Called from reconcile-cron; auto-applies when enabled and an update is available. */
export async function runScheduledUpdateCheck(): Promise<{
  checked: boolean;
  updateAvailable: boolean;
  applied: boolean;
  version: string | null;
  error?: string;
}> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) {
    return { checked: false, updateAvailable: false, applied: false, version: null };
  }
  if (resolveUpdatePlatform(org) !== "cloudflare") {
    return { checked: false, updateAvailable: false, applied: false, version: null };
  }
  if (!org.autoUpdateEnabled) {
    return { checked: false, updateAvailable: false, applied: false, version: null };
  }

  const intervalMinutes = normalizeAutoUpdateCheckIntervalMinutes(
    org.autoUpdateCheckIntervalMinutes,
  );
  const intervalMs = intervalMinutes * 60 * 1000;
  if (org.lastUpdateCheckAt) {
    const elapsed = Date.now() - org.lastUpdateCheckAt.getTime();
    if (elapsed < intervalMs) {
      return { checked: false, updateAvailable: false, applied: false, version: null };
    }
  }

  const status = await getUpdatesStatus({ forceCheck: true });
  if (!status.updateAvailable || !status.canApply) {
    return {
      checked: true,
      updateAvailable: status.updateAvailable,
      applied: false,
      version: status.latestVersion,
      error: status.applyBlockedReason ?? undefined,
    };
  }

  try {
    const result = await applyCloudflareReleaseUpdate();
    return {
      checked: true,
      updateAvailable: true,
      applied: true,
      version: result.appliedVersion,
    };
  } catch (err) {
    return {
      checked: true,
      updateAvailable: true,
      applied: false,
      version: status.latestVersion,
      error: err instanceof Error ? err.message : "Apply failed",
    };
  }
}
