import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  PCO_NIGHTLY_RECONCILE_CRON,
  PCO_NIGHTLY_RECONCILE_SCHEDULE_LABEL,
} from "@cco/shared";
import { db } from "../db";
import { users, organizations } from "../db/schema";
import {
  getDefaultPcoWebRedirectUri,
  getPcoWebRedirectUri,
  getPcoWebhookUrl,
  resolvePcoWebhookUrl,
} from "../auth/pco-redirect-uris";
import {
  getConfiguredOrganization,
  isSetupComplete,
  updateOrganizationOAuthSettings,
} from "../services/org-oauth";
import {
  ensureVapidKeys,
  getOrganizationVapidStatus,
  updateOrganizationVapidSubject,
} from "../services/org-vapid";
import {
  getOrganizationGiphyStatus,
  updateOrganizationGiphyApiKey,
} from "../services/org-giphy";
import {
  disableOrganizationRealtimeKitCalls,
  enableOrganizationRealtimeKit,
  getOrganizationRealtimeKitStatus,
  saveOrganizationCloudflareApiToken,
} from "../services/org-realtimekit";
import {
  getOrganizationCloudflarePlatformStatus,
  provisionCloudflarePlatform,
} from "../services/cloudflare-platform-provision";
import { selectConfiguredOrganizationRow } from "../services/configured-org-query";
import { invalidateOrgContextCache } from "../services/org-context-cache";
import {
  isPcoClientSecretConfigured,
  isPcoWebhookSecretsConfigured,
} from "../services/org-secrets";
import { decryptWebhookSecrets } from "../webhooks/secrets";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { syncPcoDataForUser } from "../services/pco-data-sync";
import { verifyCloudflareUpdateApplyPermissions } from "@cco/cloudflare-provision";
import {
  applyCloudflareReleaseUpdate,
  executeCloudflareReleaseUpdate,
  getUpdatesStatus,
  resolveOrgHostnames,
  setAutoUpdateEnabled,
  setGitRepoUrl,
  startCloudflareReleaseUpdate,
} from "../services/org-updates";
import { resolveOrgGitRepoUrl } from "../services/git-release-index";
import { CCO_DEFAULT_GIT_REPO_URL } from "@cco/shared";
import { getExecutionContext, isCloudflareRuntime } from "../runtime/worker-context";

type Env = { Variables: AuthVariables };

const IntegrationsPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  webhookSecret: z.string().min(1).optional(),
  signInRedirectUri: z.string().url().optional(),
  webhookUrl: z.string().url().optional(),
  vapidSubjectEmail: z.string().email().optional(),
  giphyApiKey: z.string().min(1).optional(),
  cloudflareApiToken: z.string().min(1).optional(),
  pcoNightlySyncEnabled: z.boolean().optional(),
  gitRepoUrl: z.string().min(1).optional(),
});

const RealtimeKitSetupSchema = z.object({
  enabled: z.boolean(),
});

const CloudflareTokenSchema = z.object({
  cloudflareApiToken: z.string().min(1),
});

const UpdatesApplySchema = z.object({
  cloudflareApiToken: z.string().min(1).optional(),
});

const UpdatesPatchSchema = z
  .object({
    autoUpdateEnabled: z.boolean().optional(),
    gitRepoUrl: z.string().min(1).optional(),
  })
  .refine((data) => data.autoUpdateEnabled !== undefined || data.gitRepoUrl !== undefined, {
    message: "No fields to update",
  });

export const settingsRouter = new Hono<Env>();

function pcoSyncSettingsFields(org: {
  pcoLastSyncedAt: Date | null;
  pcoNightlySyncEnabled: boolean;
}) {
  return {
    pcoLastSyncedAt: org.pcoLastSyncedAt?.toISOString() ?? null,
    pcoNightlySyncEnabled: org.pcoNightlySyncEnabled,
    pcoNightlySyncCron: PCO_NIGHTLY_RECONCILE_CRON,
    pcoNightlySyncSchedule: PCO_NIGHTLY_RECONCILE_SCHEDULE_LABEL,
  };
}

async function getOrgAdmin(c: { get: (key: "session") => { userId: string } }) {
  const session = c.get("session");
  const row = await db
    .select({
      siteAdministrator: users.siteAdministrator,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const user = row[0];
  if (!user?.siteAdministrator) return null;
  return user;
}

settingsRouter.get("/integrations", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  const org = await getConfiguredOrganization();
  if (!org) return c.json({ error: "Organization not found" }, 404);

  await ensureVapidKeys(org.id);
  const refreshed = (await getConfiguredOrganization()) ?? org;
  const vapidStatus = await getOrganizationVapidStatus(refreshed);
  const giphyStatus = getOrganizationGiphyStatus(refreshed);
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(refreshed);
  const platformStatus = getOrganizationCloudflarePlatformStatus(refreshed);
  const webhookConfigured = isPcoWebhookSecretsConfigured(refreshed);

  return c.json({
    configured: true,
    name: refreshed.name,
    clientId: refreshed.pcoClientId ?? "",
    clientSecretConfigured: isPcoClientSecretConfigured(refreshed),
    webhookConfigured,
    webhookSecretCount: webhookConfigured ? 1 : 0,
    signInRedirectUri: await getPcoWebRedirectUri(),
    webhookUrl: await getPcoWebhookUrl(),
    ...pcoSyncSettingsFields(refreshed),
    ...vapidStatus,
    ...giphyStatus,
    ...realtimeKitStatus,
    ...platformStatus,
    gitRepoUrl: resolveOrgGitRepoUrl(refreshed.gitRepoUrl),
    defaultGitRepoUrl: CCO_DEFAULT_GIT_REPO_URL,
  });
});

settingsRouter.patch("/integrations", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  const org = await getConfiguredOrganization();
  if (!org) return c.json({ error: "Organization not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = IntegrationsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const cloudflareApiToken = data.cloudflareApiToken?.trim();

  await updateOrganizationOAuthSettings({
    organizationId: org.id,
    name: data.name,
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    webhookSecret: data.webhookSecret,
    signInRedirectUri: data.signInRedirectUri,
    webhookUrl: data.webhookUrl,
    cloudflareApiToken,
  });

  if (data.vapidSubjectEmail !== undefined) {
    try {
      await updateOrganizationVapidSubject({
        organizationId: org.id,
        subjectEmail: data.vapidSubjectEmail,
        cloudflareApiToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid VAPID contact email";
      return c.json({ error: message }, 400);
    }
  }

  if (data.giphyApiKey !== undefined) {
    try {
      await updateOrganizationGiphyApiKey({
        organizationId: org.id,
        apiKey: data.giphyApiKey,
        cloudflareApiToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid Giphy API key";
      return c.json({ error: message }, 400);
    }
  }

  if (data.gitRepoUrl !== undefined) {
    try {
      await setGitRepoUrl(data.gitRepoUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid git repository URL";
      return c.json({ error: message }, 400);
    }
  }

  if (data.pcoNightlySyncEnabled !== undefined) {
    await db
      .update(organizations)
      .set({ pcoNightlySyncEnabled: data.pcoNightlySyncEnabled })
      .where(eq(organizations.id, org.id));
    invalidateOrgContextCache();
  }

  const updated = await getConfiguredOrganization();
  const statusOrg = updated ?? org;
  const vapidStatus = await getOrganizationVapidStatus(statusOrg);
  const giphyStatus = getOrganizationGiphyStatus(statusOrg);
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(statusOrg);
  return c.json({
    ok: true,
    name: statusOrg.name,
    clientId: statusOrg.pcoClientId ?? "",
    clientSecretConfigured: isPcoClientSecretConfigured(statusOrg),
    webhookConfigured: isPcoWebhookSecretsConfigured(statusOrg),
    webhookSecretCount: isPcoWebhookSecretsConfigured(statusOrg) ? 1 : 0,
    signInRedirectUri:
      updated?.pcoWebRedirectUri ??
      org.pcoWebRedirectUri ??
      getDefaultPcoWebRedirectUri(),
    webhookUrl: resolvePcoWebhookUrl(
      updated?.pcoWebhookUrl ?? org.pcoWebhookUrl,
    ),
    ...(updated ? pcoSyncSettingsFields(updated) : pcoSyncSettingsFields(org)),
    ...vapidStatus,
    ...giphyStatus,
    ...realtimeKitStatus,
  });
});

settingsRouter.post("/integrations/realtimekit", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  const org = await getConfiguredOrganization();
  if (!org) return c.json({ error: "Organization not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = RealtimeKitSetupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { enabled } = parsed.data;
  const current = getOrganizationRealtimeKitStatus(org);

  try {
    if (enabled) {
      await enableOrganizationRealtimeKit({
        organizationId: org.id,
        organizationName: org.name,
      });
    } else {
      if (current.realtimeKitFromEnv) {
        return c.json(
          { error: "Calls are configured via server environment and cannot be disabled here." },
          400,
        );
      }
      await disableOrganizationRealtimeKitCalls(org.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "RealtimeKit setup failed";
    return c.json({ error: message }, 400);
  }

  invalidateOrgContextCache();
  const updated =
    (await selectConfiguredOrganizationRow(eq(organizations.id, org.id))) ?? org;
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(updated);
  return c.json({
    ok: true,
    ...realtimeKitStatus,
  });
});

settingsRouter.post("/integrations/cloudflare", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  const org = await getConfiguredOrganization();
  if (!org) return c.json({ error: "Organization not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = CloudflareTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const current = getOrganizationRealtimeKitStatus(org);
  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    return c.json({ error: "Could not resolve chat/API hostnames from organization URLs" }, 400);
  }
  const accountId = org.cloudflareAccountId?.trim() || current.realtimeKitAccountId?.trim();
  if (!accountId) {
    return c.json({ error: "Cloudflare account is not linked to this organization" }, 400);
  }

  try {
    const apiToken = parsed.data.cloudflareApiToken.trim();
    await verifyCloudflareUpdateApplyPermissions({
      accountId,
      apiToken,
      chatHostname: hostnames.chatHostname,
      apiHostname: hostnames.apiHostname,
    });
    await saveOrganizationCloudflareApiToken({
      organizationId: org.id,
      apiToken,
      existingAccountId: current.realtimeKitAccountId || undefined,
    });
    await provisionCloudflarePlatform({
      organizationId: org.id,
      apiToken,
      existingAccountId: current.realtimeKitAccountId || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Cloudflare API token";
    return c.json({ error: message }, 400);
  }

  invalidateOrgContextCache();
  const updated =
    (await selectConfiguredOrganizationRow(eq(organizations.id, org.id))) ?? org;
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(updated);
  const platformStatus = getOrganizationCloudflarePlatformStatus(updated);
  return c.json({
    ok: true,
    ...realtimeKitStatus,
    ...platformStatus,
  });
});

settingsRouter.post("/integrations/pco-sync", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  const session = c.get("session");
  const result = await syncPcoDataForUser(session, c);
  if ("status" in result) {
    return c.json(
      { error: result.error, needsReconnect: result.needsReconnect },
      result.status as 401 | 403 | 500 | 502,
    );
  }

  return c.json({
    synced: true,
    pcoLastSyncedAt: result.syncedAt.toISOString(),
    groups: result.groups,
    teams: result.teams,
  });
});

settingsRouter.get("/updates", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  try {
    const status = await getUpdatesStatus();
    return c.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load updates";
    return c.json({ error: message }, 500);
  }
});

settingsRouter.post("/updates/check", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  try {
    const status = await getUpdatesStatus({ forceCheck: true });
    return c.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update check failed";
    return c.json({ error: message }, 502);
  }
});

settingsRouter.post("/updates/apply", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  try {
    let apiTokenOverride: string | undefined;
    const rawBody = await c.req.text();
    if (rawBody.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      const parsed = UpdatesApplySchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }
      apiTokenOverride = parsed.data.cloudflareApiToken?.trim();
    }

    const executionCtx = getExecutionContext();
    if (isCloudflareRuntime() && executionCtx) {
      const { job, targetVersion } = await startCloudflareReleaseUpdate({ apiTokenOverride });
      executionCtx.waitUntil(
        executeCloudflareReleaseUpdate(job).catch((err) => {
          console.error("[org-updates] Background apply failed:", err);
        }),
      );
      const status = await getUpdatesStatus();
      return c.json(
        { ok: true, accepted: true, appliedVersion: targetVersion, status },
        202,
      );
    }

    const result = await applyCloudflareReleaseUpdate({ apiTokenOverride });
    const status = await getUpdatesStatus();
    return c.json({ ok: true, ...result, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply update failed";
    return c.json({ error: message }, 400);
  }
});

settingsRouter.patch("/updates", requireAuth, async (c) => {
  const admin = await getOrgAdmin(c);
  if (!admin) return c.json({ error: "Forbidden" }, 403);

  if (!(await isSetupComplete())) {
    return c.json({ error: "CCO is not configured" }, 409);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = UpdatesPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    if (parsed.data.autoUpdateEnabled !== undefined) {
      await setAutoUpdateEnabled(parsed.data.autoUpdateEnabled);
    }
    if (parsed.data.gitRepoUrl !== undefined) {
      await setGitRepoUrl(parsed.data.gitRepoUrl);
    }
    const status = await getUpdatesStatus();
    return c.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save update settings";
    return c.json({ error: message }, 400);
  }
});
