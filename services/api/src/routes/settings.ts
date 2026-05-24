import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { users } from "../db/schema";
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
import { decryptWebhookSecrets } from "../webhooks/secrets";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { syncPcoDataForUser } from "../services/pco-data-sync";

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
});

const RealtimeKitSetupSchema = z.object({
  enabled: z.boolean(),
});

const CloudflareTokenSchema = z.object({
  cloudflareApiToken: z.string().min(1),
});

export const settingsRouter = new Hono<Env>();

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
  const webhookSecrets = decryptWebhookSecrets(refreshed.pcoWebhookSecretEnc);

  return c.json({
    configured: true,
    name: refreshed.name,
    clientId: refreshed.pcoClientId ?? "",
    clientSecretConfigured: Boolean(refreshed.pcoClientSecretEnc),
    webhookConfigured: webhookSecrets.length > 0,
    webhookSecretCount: webhookSecrets.length,
    signInRedirectUri: await getPcoWebRedirectUri(),
    webhookUrl: await getPcoWebhookUrl(),
    ...vapidStatus,
    ...giphyStatus,
    ...realtimeKitStatus,
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

  await updateOrganizationOAuthSettings({
    organizationId: org.id,
    name: data.name,
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    webhookSecret: data.webhookSecret,
    signInRedirectUri: data.signInRedirectUri,
    webhookUrl: data.webhookUrl,
  });

  if (data.vapidSubjectEmail !== undefined) {
    try {
      await updateOrganizationVapidSubject({
        organizationId: org.id,
        subjectEmail: data.vapidSubjectEmail,
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
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid Giphy API key";
      return c.json({ error: message }, 400);
    }
  }

  const updated = await getConfiguredOrganization();
  const webhookSecrets = decryptWebhookSecrets(
    updated?.pcoWebhookSecretEnc ?? org.pcoWebhookSecretEnc,
  );
  const vapidStatus = await getOrganizationVapidStatus(updated ?? org);
  const giphyStatus = getOrganizationGiphyStatus(updated ?? org);
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(updated ?? org);
  return c.json({
    ok: true,
    name: updated?.name ?? org.name,
    clientId: updated?.pcoClientId ?? org.pcoClientId ?? "",
    clientSecretConfigured: Boolean(
      updated?.pcoClientSecretEnc ?? org.pcoClientSecretEnc,
    ),
    webhookConfigured: webhookSecrets.length > 0,
    webhookSecretCount: webhookSecrets.length,
    signInRedirectUri:
      updated?.pcoWebRedirectUri ??
      org.pcoWebRedirectUri ??
      getDefaultPcoWebRedirectUri(),
    webhookUrl: resolvePcoWebhookUrl(
      updated?.pcoWebhookUrl ?? org.pcoWebhookUrl,
    ),
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

  const updated = await getConfiguredOrganization();
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(updated ?? org);
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

  try {
    await saveOrganizationCloudflareApiToken({
      organizationId: org.id,
      apiToken: parsed.data.cloudflareApiToken,
      existingAccountId: current.realtimeKitAccountId || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Cloudflare API token";
    return c.json({ error: message }, 400);
  }

  const updated = await getConfiguredOrganization();
  const realtimeKitStatus = getOrganizationRealtimeKitStatus(updated ?? org);
  return c.json({
    ok: true,
    ...realtimeKitStatus,
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
    groups: result.groups,
    teams: result.teams,
  });
});
