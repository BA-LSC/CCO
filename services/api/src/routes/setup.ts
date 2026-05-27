import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { organizations, userPcoCredentials, users } from "../db/schema";
import {
  completeOrganizationSetup,
  getActiveOrgOAuthCredentials,
  getConfiguredOrganization,
  getOrganizationWithOAuthCredentials,
  isSetupComplete,
  saveSetupDraft,
} from "../services/org-oauth";
import { issueSetupSessionToken } from "../services/setup-session";
import { decryptSecret } from "../auth/token-crypto";
import { fetchPcoMe, isPcoSiteAdministrator } from "../services/setup";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { getPcoAccessToken } from "../auth/pco-tokens";
import {
  getDefaultPcoWebRedirectUri,
  getDefaultPcoWebhookUrl,
  getPcoApiRedirectUri,
  getPcoMobileRedirectUri,
  getPcoWebRedirectUri,
  getPcoWebhookUrl,
  resolvePcoWebhookUrl,
} from "../auth/pco-redirect-uris";
import { decryptWebhookSecrets } from "../webhooks/secrets";
import { saveOrganizationCloudflareApiToken } from "../services/org-realtimekit";

type Env = { Variables: AuthVariables };

const DraftSchema = z
  .object({
    name: z.string().min(1).max(120),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1).optional(),
    signInRedirectUri: z.string().url(),
    webhookUrl: z.string().url(),
    webhookSecret: z.string().min(1).optional(),
    cloudflareApiToken: z.string().min(1).optional(),
  });

export const setupRouter = new Hono<Env>();

function draftFromOrg(org: typeof organizations.$inferSelect) {
  const webhookSecrets = decryptWebhookSecrets(org.pcoWebhookSecretEnc);
  return {
    name: org.name === "Pending setup" ? "" : org.name,
    clientId: org.pcoClientId ?? "",
    hasClientSecret: Boolean(org.pcoClientSecretEnc),
    webhookConfigured: webhookSecrets.length > 0,
    webhookSecretCount: webhookSecrets.length,
    webhooksEnabled: webhookSecrets.length > 0,
    credentialsSaved: Boolean(
      org.pcoClientId && org.pcoClientSecretEnc && webhookSecrets.length > 0,
    ),
    signInRedirectUri: org.pcoWebRedirectUri ?? null,
    webhookUrl: resolvePcoWebhookUrl(org.pcoWebhookUrl),
    cloudflareApiTokenConfigured: Boolean(org.cloudflareApiTokenEnc),
  };
}

setupRouter.get("/status", async (c) => {
  const configured = await isSetupComplete();
  const orgWithOAuth = await getOrganizationWithOAuthCredentials();
  const credentials = await getActiveOrgOAuthCredentials();
  const org = configured ? await getConfiguredOrganization() : orgWithOAuth;
  const churchName =
    org?.name && org.name !== "Pending setup" ? org.name.trim() : null;
  const webhookSecrets = org ? decryptWebhookSecrets(org.pcoWebhookSecretEnc) : [];
  return c.json({
    configured,
    churchName,
    signInAvailable: Boolean(credentials),
    credentialsInDb: Boolean(orgWithOAuth?.pcoClientId && orgWithOAuth?.pcoClientSecretEnc),
    webhooksEnabled: webhookSecrets.length > 0,
  });
});

setupRouter.get("/draft", async (c) => {
  if (await isSetupComplete()) {
    return c.json({ configured: true, draft: null });
  }

  const org = await getOrganizationWithOAuthCredentials();
  if (!org) {
    return c.json({ configured: false, draft: null });
  }

  return c.json({ configured: false, draft: draftFromOrg(org) });
});

setupRouter.post("/draft", async (c) => {
  if (await isSetupComplete()) {
    return c.json({ error: "CCO is already configured" }, 409);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const existingOrg = await getOrganizationWithOAuthCredentials();
  let clientSecret = parsed.data.clientSecret?.trim() ?? "";
  if (!clientSecret) {
    if (existingOrg?.pcoClientSecretEnc) {
      clientSecret = decryptSecret(existingOrg.pcoClientSecretEnc);
    } else {
      return c.json({ error: "OAuth client secret is required" }, 400);
    }
  }

  let cloudflareApiToken = parsed.data.cloudflareApiToken?.trim() ?? "";
  if (!cloudflareApiToken) {
    if (existingOrg?.cloudflareApiTokenEnc) {
      cloudflareApiToken = decryptSecret(existingOrg.cloudflareApiTokenEnc);
    } else {
      return c.json({ error: "Cloudflare API token is required" }, 400);
    }
  }

  const existingWebhookSecrets = existingOrg
    ? decryptWebhookSecrets(existingOrg.pcoWebhookSecretEnc)
    : [];
  let webhookSecretRaw = parsed.data.webhookSecret?.trim() ?? "";
  if (!webhookSecretRaw) {
    if (existingWebhookSecrets.length > 0) {
      webhookSecretRaw = existingWebhookSecrets.join("\n");
    } else {
      return c.json({ error: "Webhook secrets are required" }, 400);
    }
  }

  try {
    await saveSetupDraft({
      name: parsed.data.name,
      clientId: parsed.data.clientId,
      clientSecret,
      signInRedirectUri: parsed.data.signInRedirectUri,
      webhookUrl: parsed.data.webhookUrl,
      webhookSecret: webhookSecretRaw,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save setup";
    return c.json({ error: message }, 400);
  }

  const orgBeforeCloudflare = await getOrganizationWithOAuthCredentials();
  if (orgBeforeCloudflare) {
    try {
      await saveOrganizationCloudflareApiToken({
        organizationId: orgBeforeCloudflare.id,
        apiToken: cloudflareApiToken,
        existingAccountId: orgBeforeCloudflare.cloudflareAccountId ?? undefined,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid Cloudflare API token";
      return c.json({ error: message }, 400);
    }
  }

  const org = await getOrganizationWithOAuthCredentials();
  if (!org) {
    return c.json({ ok: true, draft: null });
  }

  const setupToken = await issueSetupSessionToken(org.id);
  return c.json({ ok: true, setupToken, draft: draftFromOrg(org) });
});

setupRouter.post("/finish", requireAuth, async (c) => {
  if (await isSetupComplete()) {
    return c.json({ error: "CCO is already configured" }, 409);
  }

  const org = await getOrganizationWithOAuthCredentials();
  if (!org?.pcoClientId || !org.pcoClientSecretEnc) {
    return c.json({ error: "Save OAuth credentials before finishing setup" }, 400);
  }

  const session = c.get("session");
  const userRow = await db
    .select({
      siteAdministrator: users.siteAdministrator,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const user = userRow[0];
  if (!user) return c.json({ error: "User not found" }, 404);

  const pcoCreds = await db
    .select({ userId: userPcoCredentials.userId })
    .from(userPcoCredentials)
    .where(eq(userPcoCredentials.userId, session.userId))
    .limit(1);

  if (pcoCreds.length === 0) {
    return c.json({ error: "Sign in with Planning Center before finishing setup" }, 403);
  }

  const accessToken = await getPcoAccessToken(session.userId);
  if (accessToken) {
    const profile = await fetchPcoMe(accessToken);
    if (profile && !isPcoSiteAdministrator(profile) && !user.siteAdministrator) {
      return c.json({ error: "Only a Planning Center organization administrator can complete setup" }, 403);
    }
  } else if (!user.siteAdministrator) {
    return c.json({ error: "Only a Planning Center organization administrator can complete setup" }, 403);
  }

  await completeOrganizationSetup({
    organizationId: org.id,
    userId: session.userId,
  });

  return c.json({ ok: true, redirectTo: "/groups" });
});

setupRouter.get("/redirect-uris", async (c) => {
  return c.json({
    signInRedirectUri: await getPcoWebRedirectUri(),
    webhookUrl: await getPcoWebhookUrl(),
    apiRedirectUri: getPcoApiRedirectUri(),
    mobileRedirectUri: getPcoMobileRedirectUri(),
    defaultSignInRedirectUri: getDefaultPcoWebRedirectUri(),
    defaultWebhookUrl: getDefaultPcoWebhookUrl(),
  });
});

setupRouter.get("/me", requireAuth, async (c) => {
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
  if (!user) return c.json({ error: "User not found" }, 404);

  const pcoCreds = await db
    .select({ userId: userPcoCredentials.userId })
    .from(userPcoCredentials)
    .where(eq(userPcoCredentials.userId, session.userId))
    .limit(1);

  const org = await getOrganizationWithOAuthCredentials();
  const configured = await isSetupComplete();

  return c.json({
    configured,
    isOrgAdmin: user.siteAdministrator === true,
    hasPcoConnection: pcoCreds.length > 0,
    draft: org ? draftFromOrg(org) : null,
  });
});

setupRouter.get("/oauth-config", async (c) => {
  const credentials = await getActiveOrgOAuthCredentials();
  if (!credentials) {
    return c.json({ error: "OAuth is not configured" }, 503);
  }

  return c.json({
    clientId: credentials.clientId,
    scope: credentials.scope,
    signInRedirectUri: await getPcoWebRedirectUri(),
  });
});

setupRouter.get("/oauth-available", async (c) => {
  const configured = await isSetupComplete();
  const credentials = await getActiveOrgOAuthCredentials();
  const orgWithOAuth = await getOrganizationWithOAuthCredentials();
  return c.json({
    configured,
    credentialsInDb: Boolean(orgWithOAuth?.pcoClientId && orgWithOAuth.pcoClientSecretEnc),
    signInAvailable: Boolean(credentials),
  });
});
