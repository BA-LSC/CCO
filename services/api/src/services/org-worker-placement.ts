import {
  deployAllProvisionWorkers,
  ensureD1Database,
  type CcoWorkerScriptName,
} from "@cco/cloudflare-provision";
import {
  isUpdateAvailable,
  normalizeWorkerPlacementSetting,
  WORKER_PLACEMENT_MODE_REGION,
  WORKER_PLACEMENT_MODE_SMART,
  WORKER_PLACEMENT_REGION_OPTIONS,
  workerPlacementSettingFromOrgRow,
  type ReleaseIndex,
  type WorkerPlacementMode,
  type WorkerPlacementSetting,
} from "@cco/shared";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { fetchReleaseIndexForOrg, resolveOrgGitRepoUrl, resolveReleasesBaseUrl } from "./git-release-index";
import { invalidateOrgContextCache } from "./org-context-cache";
import type { ConfiguredOrganizationRow } from "./org-select";
import {
  isCloudflareApiTokenConfigured,
  resolveApplyCloudflareApiToken,
} from "./org-secrets";
import { isCloudflarePlatformFromEnv } from "./cloudflare-platform-provision";
import { resolveOrgHostnames, resolveUpdatePlatform } from "./org-updates";

export function isWorkerPlacementEditable(
  org: ConfiguredOrganizationRow,
  platformFromEnv?: boolean,
): boolean {
  if (platformFromEnv ?? isCloudflarePlatformFromEnv(org)) return false;
  if (!isCloudflareApiTokenConfigured(org) || !org.cloudflareAccountId?.trim()) return false;
  if (org.cloudflarePlatformProvisionedAt) return true;
  if (org.cloudflareR2BucketName?.trim() && org.cloudflareKvPresenceNamespaceId?.trim()) {
    return true;
  }
  return resolveUpdatePlatform(org) === "cloudflare";
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

export function getWorkerPlacementStatus(
  org: ConfiguredOrganizationRow,
  platformFromEnv?: boolean,
) {
  const setting = workerPlacementSettingFromOrgRow(org);
  const regionLabel =
    WORKER_PLACEMENT_REGION_OPTIONS.find((option) => option.id === setting.region)?.label ??
    setting.region;
  return {
    workerPlacementMode: setting.mode,
    workerPlacementRegion: setting.region,
    workerPlacementRegionOptions: WORKER_PLACEMENT_REGION_OPTIONS,
    workerPlacementSummary:
      setting.mode === WORKER_PLACEMENT_MODE_SMART
        ? "Automatic (Smart Placement)"
        : regionLabel ?? "Fixed region",
    workerPlacementEditable: isWorkerPlacementEditable(org, platformFromEnv),
  };
}

export function workerPlacementFromOrg(org: ConfiguredOrganizationRow): WorkerPlacementSetting {
  return workerPlacementSettingFromOrgRow(org);
}

/** Placement redeploy must not pull latest release bundles when an update is pending. */
export function shouldRedeployPlacementForOrg(
  org: ConfiguredOrganizationRow,
  releaseIndex: ReleaseIndex | null,
): { shouldRedeploy: boolean; skipReason?: string } {
  if (!releaseIndex) {
    return { shouldRedeploy: false };
  }
  const installedVersion = org.installedReleaseVersion?.trim() || null;
  if (
    installedVersion &&
    isUpdateAvailable(installedVersion, releaseIndex.version)
  ) {
    return {
      shouldRedeploy: false,
      skipReason:
        "Worker placement is saved. Apply the pending update to redeploy workers without mixing release versions.",
    };
  }
  return { shouldRedeploy: true };
}

export async function updateOrganizationWorkerPlacement(
  organizationId: string,
  mode: WorkerPlacementMode,
  region?: string,
): Promise<WorkerPlacementSetting> {
  const setting = normalizeWorkerPlacementSetting({
    mode,
    region: mode === WORKER_PLACEMENT_MODE_REGION ? region : null,
  });

  await db
    .update(organizations)
    .set({
      cloudflareWorkerPlacementMode: setting.mode,
      cloudflareWorkerPlacementRegion:
        setting.mode === WORKER_PLACEMENT_MODE_REGION ? setting.region : null,
    })
    .where(eq(organizations.id, organizationId));
  invalidateOrgContextCache();
  return setting;
}

export async function redeployWorkersWithOrgPlacement(
  org: ConfiguredOrganizationRow,
  options?: { apiTokenOverride?: string },
): Promise<string[]> {
  if (resolveUpdatePlatform(org) !== "cloudflare") {
    throw new Error("Worker placement applies only to BYO Cloudflare installs");
  }
  if (!isCloudflareApiTokenConfigured(org) || !org.cloudflareAccountId?.trim()) {
    throw new Error("Cloudflare credentials are not configured");
  }

  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    throw new Error("Could not resolve chat/API hostnames from organization URLs");
  }

  const apiToken = resolveApplyCloudflareApiToken(org, options?.apiTokenOverride);
  if (!apiToken) {
    throw new Error("Cloudflare API token is not available");
  }

  const secretsStoreId = org.cloudflareSecretsStoreId?.trim();
  if (!secretsStoreId) {
    throw new Error("Secrets Store is not configured for this organization");
  }

  const missing = [
    org.cloudflareR2BucketName,
    org.cloudflareKvPresenceNamespaceId,
    org.cloudflareKvDeployNamespaceId,
    org.cloudflarePushQueueId,
  ].some((value) => !value?.trim());
  if (missing) {
    throw new Error("Cloudflare platform resources are incomplete");
  }

  const gitRepoUrl = resolveOrgGitRepoUrl(org.gitRepoUrl);
  const releaseIndex = await fetchReleaseIndexForOrg(gitRepoUrl);
  if (!releaseIndex) {
    throw new Error("Release is not ready");
  }
  const releasesBase = resolveReleasesBaseUrl(releaseIndex);
  const accountId = org.cloudflareAccountId.trim();
  const d1 = await ensureD1Database(accountId, apiToken, "cco");

  const placement = workerPlacementFromOrg(org);
  return deployAllProvisionWorkers({
    accountId,
    apiToken,
    secretsStoreId,
    apiHostname: hostnames.apiHostname,
    workerPlacement: { mode: placement.mode, region: placement.region },
    resources: {
      accountId,
      d1DatabaseId: d1.uuid,
      r2BucketName: org.cloudflareR2BucketName ?? "",
      kvPresenceNamespaceId: org.cloudflareKvPresenceNamespaceId ?? "",
      kvDeployNamespaceId: org.cloudflareKvDeployNamespaceId ?? "",
      pushQueueId: org.cloudflarePushQueueId ?? "",
      chatHostname: hostnames.chatHostname,
      apiHostname: hostnames.apiHostname,
    },
    readBundle: createRemoteBundleLoader(releasesBase),
  });
}
