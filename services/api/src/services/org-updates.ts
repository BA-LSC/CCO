import {
  CCO_RELEASE_INDEX_URL,
  type ReleaseIndex,
} from "@cco/shared/release-index";
import {
  applyD1MigrationStatements,
  deployAllProvisionWorkers,
  deployCcoWebWorker,
  ensureD1Database,
  fetchWebReleaseManifest,
  type CcoWorkerScriptName,
  type ProvisionSecrets,
} from "@cco/cloudflare-provision";
import { getD1IncrementalMigrationFilenames } from "@cco/db";
import { eq, sql } from "drizzle-orm";
import { decryptSecret } from "../auth/token-crypto";
import { db } from "../db";
import { organizations } from "../db/schema";
import { isCloudflareRuntime } from "../runtime/worker-context";
import { setDeployDraining } from "../lib/deploy-status";
import { getConfiguredOrganization } from "./org-oauth";
import { ensureCloudflareOrganizationColumns } from "./org-schema-capabilities";
import { invalidateOrgContextCache } from "./org-context-cache";

const D1_UPDATE_COLUMN_STATEMENTS = [
  `ALTER TABLE "organizations" ADD COLUMN "installed_release_version" TEXT`,
  `ALTER TABLE "organizations" ADD COLUMN "auto_update_enabled" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "organizations" ADD COLUMN "last_update_check_at" INTEGER`,
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
  lastUpdateCheckAt: string | null;
  latestPublishedAt: string | null;
  releasesBaseUrl: string | null;
  canApply: boolean;
  applyBlockedReason: string | null;
};

export type CloudflareReleaseUpdateJob = {
  orgId: string;
  accountId: string;
  apiToken: string;
  secrets: ProvisionSecrets;
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

function resolveReleaseIndexUrl(): string {
  const explicit = process.env.CCO_RELEASE_INDEX_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.CCO_RELEASES_BASE_URL?.trim()?.replace(/\/+$/, "");
  if (base) return `${base}/release-index.json`;
  return CCO_RELEASE_INDEX_URL;
}

function resolveReleasesBaseUrl(index: ReleaseIndex): string {
  return index.releasesBaseUrl.replace(/\/+$/, "");
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
  cloudflareAccountId: string | null;
}): UpdatePlatform {
  if (
    org.cloudflarePlatformProvisionedAt &&
    org.cloudflareApiTokenEnc &&
    org.cloudflareAccountId
  ) {
    return "cloudflare";
  }
  if (isCloudflareRuntime()) return "cloudflare";
  if (process.env.CCO_DEPLOY_TARGET === "cloudflare") return "cloudflare";
  if (process.env.DATABASE_URL?.trim()) return "vps";
  return "unknown";
}

export async function fetchReleaseIndex(): Promise<ReleaseIndex> {
  const url = resolveReleaseIndexUrl();
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Release index unavailable (HTTP ${res.status})`);
  }
  const json = (await res.json()) as ReleaseIndex;
  if (!json.version?.trim()) {
    throw new Error("Release index missing version");
  }
  return json;
}

function isUpdateAvailable(current: string | null, latest: string): boolean {
  if (!current) return true;
  return current !== latest;
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
  const currentVersion =
    org.installedReleaseVersion?.trim() || resolveRunningBuildVersion();
  let latestIndex: ReleaseIndex | null = null;
  let checkError: string | null = null;

  if (options?.forceCheck || !org.lastUpdateCheckAt) {
    try {
      latestIndex = await fetchReleaseIndex();
    } catch (err) {
      checkError = err instanceof Error ? err.message : "Release check failed";
    }
    await db
      .update(organizations)
      .set({ lastUpdateCheckAt: new Date() })
      .where(eq(organizations.id, org.id));
  } else {
    try {
      latestIndex = await fetchReleaseIndex();
    } catch {
      // Stale check data is acceptable when not forcing.
    }
  }

  const latestVersion = latestIndex?.version ?? null;
  const updateAvailable = latestVersion
    ? isUpdateAvailable(currentVersion, latestVersion)
    : false;

  let canApply = platform === "cloudflare";
  let applyBlockedReason: string | null = null;

  if (platform === "vps") {
    canApply = false;
    applyBlockedReason =
      "VPS deployments update via git pull on the server (./deploy/update.sh), not from Admin Updates.";
  } else if (platform !== "cloudflare") {
    canApply = false;
    applyBlockedReason = "Update apply is only supported for BYO Cloudflare installs.";
  } else if (!org.cloudflareApiTokenEnc) {
    canApply = false;
    applyBlockedReason = "Cloudflare API token is not configured.";
  } else if (!resolveOrgHostnames(org)) {
    canApply = false;
    applyBlockedReason = "Could not resolve chat/API hostnames from organization URLs.";
  } else if (checkError) {
    canApply = false;
    applyBlockedReason = checkError;
  } else if (!updateAvailable) {
    canApply = false;
    applyBlockedReason = "Already on the latest release.";
  }

  return {
    platform,
    currentVersion,
    latestVersion,
    updateAvailable,
    autoUpdateEnabled: org.autoUpdateEnabled ?? false,
    lastUpdateCheckAt: org.lastUpdateCheckAt?.toISOString() ?? null,
    latestPublishedAt: latestIndex?.publishedAt ?? null,
    releasesBaseUrl: latestIndex ? resolveReleasesBaseUrl(latestIndex) : null,
    canApply,
    applyBlockedReason,
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

export async function prepareCloudflareReleaseUpdate(): Promise<CloudflareReleaseUpdateJob> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) throw new Error("Organization not found");
  if (resolveUpdatePlatform(org) !== "cloudflare") {
    throw new Error("Apply update is only supported for BYO Cloudflare installs");
  }
  if (!org.cloudflareApiTokenEnc || !org.cloudflareAccountId) {
    throw new Error("Cloudflare credentials are not configured");
  }

  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    throw new Error("Could not resolve chat/API hostnames from organization URLs");
  }

  const releaseIndex = await fetchReleaseIndex();
  const releasesBase = resolveReleasesBaseUrl(releaseIndex);
  const currentVersion =
    org.installedReleaseVersion?.trim() || resolveRunningBuildVersion();
  if (!isUpdateAvailable(currentVersion, releaseIndex.version)) {
    throw new Error("Already on the latest release");
  }

  const apiToken = decryptSecret(org.cloudflareApiTokenEnc);
  const accountId = org.cloudflareAccountId;
  const secrets = requireProvisionSecrets();
  const readBundle = createRemoteBundleLoader(releasesBase);

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
    secrets,
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
    await applyIncrementalD1Migrations(job);

    const deployedWorkers = await deployAllProvisionWorkers({
      accountId: job.accountId,
      apiToken: job.apiToken,
      resources: job.resources,
      secrets: job.secrets,
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
      secrets: job.secrets,
      workerModuleUrl: `${job.releasesBase}/cco-web.mjs`,
      assetsBaseUrl: `${job.releasesBase}/assets/`,
      assetsManifest,
    });

    await db
      .update(organizations)
      .set({
        installedReleaseVersion: job.targetVersion,
        lastUpdateCheckAt: new Date(),
      })
      .where(eq(organizations.id, job.orgId));
    invalidateOrgContextCache();

    return { appliedVersion: job.targetVersion, deployedWorkers };
  } finally {
    await setDeployDraining(false);
  }
}

export async function startCloudflareReleaseUpdate(): Promise<{
  job: CloudflareReleaseUpdateJob;
  targetVersion: string;
}> {
  const job = await prepareCloudflareReleaseUpdate();
  await setDeployDraining(true);
  return { job, targetVersion: job.targetVersion };
}

export async function applyCloudflareReleaseUpdate(): Promise<{
  appliedVersion: string;
  deployedWorkers: string[];
}> {
  const job = await prepareCloudflareReleaseUpdate();
  return executeCloudflareReleaseUpdate(job);
}

export async function setAutoUpdateEnabled(enabled: boolean): Promise<void> {
  await ensureOrgUpdateSettingsColumns();
  const org = await getConfiguredOrganization();
  if (!org) throw new Error("Organization not found");

  await db
    .update(organizations)
    .set({ autoUpdateEnabled: enabled })
    .where(eq(organizations.id, org.id));
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
