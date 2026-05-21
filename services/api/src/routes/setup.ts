import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { organizations, userPcoCredentials, users } from "../db/schema";
import {
  completeOrganizationSetup,
  draftHasSensitiveData,
  getActiveOrgOAuthCredentials,
  getConfiguredOrganization,
  getOrganizationWithOAuthCredentials,
  getPendingSetupOrganization,
  isSetupComplete,
  saveSetupDraft,
} from "../services/org-oauth";
import {
  isBootstrapAuthorized,
  issueSetupSessionToken,
  verifySetupToken,
} from "../services/setup-session";
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
} from "../auth/pco-redirect-uris";
import type { Context } from "hono";
import { decryptWebhookSecrets } from "../webhooks/secrets";

type Env = { Variables: AuthVariables };

const DraftSchema = z
  .object({
    name: z.string().min(1).max(120),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    signInRedirectUri: z.string().url(),
    webhooksEnabled: z.boolean().optional().default(false),
    webhookUrl: z.string().url().optional(),
    webhookSecret: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.webhooksEnabled && !data.webhookUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Webhook URL is required when webhooks are enabled",
        path: ["webhookUrl"],
      });
    }
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
    credentialsSaved: Boolean(org.pcoClientId && org.pcoClientSecretEnc),
    signInRedirectUri: org.pcoWebRedirectUri ?? null,
    webhookUrl: org.pcoWebhookUrl ?? null,
  };
}

function setupTokenHeader(c: Context): string | undefined {
  return c.req.header("X-Setup-Token")?.trim() || undefined;
}

function setupBootstrapHeader(c: Context): string | undefined {
  return c.req.header("X-Setup-Bootstrap")?.trim() || undefined;
}

function hasValidSetupToken(
  org: typeof organizations.$inferSelect,
  token: string | undefined,
): boolean {
  if (!token || !org.setupSessionTokenHash) return false;
  return verifySetupToken(token, org.setupSessionTokenHash);
}

/** Authorize setup draft access. Returns null when allowed; otherwise a JSON error response. */
async function authorizeSetupDraftAccess(
  c: Context,
  method: "GET" | "POST",
): Promise<Response | null> {
  if (await isSetupComplete()) {
    return null;
  }

  const org = await getPendingSetupOrganization();
  const token = setupTokenHeader(c);
  const bootstrap = setupBootstrapHeader(c);

  if (org?.setupSessionTokenHash) {
    if (hasValidSetupToken(org, token) || isBootstrapAuthorized(bootstrap)) {
      return null;
    }
    return c.json({ error: "Setup token required" }, 401);
  }

  if (method === "POST") {
    return null;
  }

  if (org && draftHasSensitiveData(org)) {
    if (isBootstrapAuthorized(bootstrap)) {
      return null;
    }
    return c.json({ error: "Setup token required" }, 401);
  }

  return null;
}

/** Authorize oauth-config during incomplete setup. */
async function authorizeSetupOAuthConfigAccess(c: Context): Promise<Response | null> {
  if (await isSetupComplete()) {
    return null;
  }

  const org = await getPendingSetupOrganization();
  if (!org || !draftHasSensitiveData(org)) {
    return c.json({ error: "OAuth is not configured" }, 503);
  }

  const token = setupTokenHeader(c);
  const bootstrap = setupBootstrapHeader(c);

  if (org.setupSessionTokenHash) {
    if (hasValidSetupToken(org, token) || isBootstrapAuthorized(bootstrap)) {
      return null;
    }
    return c.json({ error: "Setup token required" }, 401);
  }

  if (isBootstrapAuthorized(bootstrap)) {
    return null;
  }

  return c.json({ error: "Setup token required" }, 401);
}

setupRouter.get("/status", async (c) => {
  const configured = await isSetupComplete();
  const orgWithOAuth = await getOrganizationWithOAuthCredentials();
  const credentials = await getActiveOrgOAuthCredentials();
  const org = configured ? await getConfiguredOrganization() : orgWithOAuth;
  const churchName =
    org?.name && org.name !== "Pending setup" ? org.name.trim() : null;
  return c.json({
    configured,
    churchName,
    signInAvailable: Boolean(credentials),
    credentialsInDb: Boolean(orgWithOAuth?.pcoClientId && orgWithOAuth.pcoClientSecretEnc),
  });
});

setupRouter.get("/draft", async (c) => {
  if (await isSetupComplete()) {
    return c.json({ configured: true, draft: null });
  }

  const denied = await authorizeSetupDraftAccess(c, "GET");
  if (denied) return denied;

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

  const denied = await authorizeSetupDraftAccess(c, "POST");
  if (denied) return denied;

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

  try {
    const webhooksEnabled = parsed.data.webhooksEnabled ?? false;
    await saveSetupDraft({
      name: parsed.data.name,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      signInRedirectUri: parsed.data.signInRedirectUri,
      webhookUrl: webhooksEnabled
        ? (parsed.data.webhookUrl ?? getDefaultPcoWebhookUrl())
        : getDefaultPcoWebhookUrl(),
      webhookSecret: webhooksEnabled ? parsed.data.webhookSecret : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save setup";
    return c.json({ error: message }, 400);
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
  const configured = await isSetupComplete();

  if (!configured) {
    const denied = await authorizeSetupOAuthConfigAccess(c);
    if (denied) return denied;
  }

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
