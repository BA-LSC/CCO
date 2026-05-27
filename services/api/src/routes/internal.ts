import { Hono } from "hono";
import { z } from "zod";
import { verifyCloudflareUpdateApplyPermissions } from "@cco/cloudflare-provision";
import { reconcileStaleMemberships } from "../jobs/reconcile";
import { getConfiguredOrganization } from "../services/org-oauth";
import {
  migrateOrganizationSecretsToStore,
  organizationHasPendingSecretsStoreMigration,
  upsertOrgSecretForOrganization,
} from "../services/org-secrets";
import { resolveOrgHostnames, runScheduledUpdateCheck } from "../services/org-updates";
import { CCO_STORE_SECRET } from "@cco/cloudflare-provision";
import { recordWebhookDelivery } from "../webhooks/delivery";
import {
  handleMembershipDestroyed,
  handleMembershipUpsert,
  handlePersonUpdated,
} from "../webhooks/handlers/membership";
import {
  collectPushTokens,
  collectWebPushSubscriptions,
  sendExpoPushDirect,
  sendWebPushDirect,
} from "../services/push-delivery";
import { verifyCfInternalAuth } from "../runtime/internal-auth";
import { isCloudflareRuntime } from "../runtime/worker-context";

const internalRouter = new Hono();

function verifyInternalAuth(c: { req: { header: (name: string) => string | undefined } }): boolean {
  return verifyCfInternalAuth(c.req.header("Authorization"));
}

internalRouter.post("/jobs/reconcile", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  const result = await reconcileStaleMemberships();
  return c.json(result);
});

const WebhookForwardSchema = z.object({
  handlerKind: z.enum(["membership_destroyed", "membership_upsert", "person_updated"]),
  payload: z.unknown(),
  deliveryId: z.string().nullable().optional(),
  eventType: z.string().optional(),
});

internalRouter.post("/webhooks/pco", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);

  const parsed = WebhookForwardSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { handlerKind, payload, deliveryId, eventType } = parsed.data;

  if (deliveryId && eventType) {
    const status = await recordWebhookDelivery({ deliveryId, eventType });
    if (status === "duplicate") {
      return c.json({ received: true, duplicate: true });
    }
  }

  try {
    if (handlerKind === "membership_destroyed") {
      await handleMembershipDestroyed(payload as never);
    } else if (handlerKind === "membership_upsert") {
      await handleMembershipUpsert(payload as never);
    } else if (handlerKind === "person_updated") {
      await handlePersonUpdated(payload as never);
    }
  } catch (err) {
    console.error("Internal webhook handler error:", err);
    return c.json({ error: "Handler failed" }, 500);
  }

  return c.json({ received: true });
});

const PushJobSchema = z.object({
  kind: z.enum(["message", "call"]),
  userIds: z.array(z.string()),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  conversationId: z.string(),
  icon: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  callId: z.string().optional(),
});

internalRouter.post("/push/deliver", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);

  const parsed = PushJobSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const job = parsed.data;
  const [expoTokens, webSubscriptions] = await Promise.all([
    collectPushTokens(job.userIds),
    collectWebPushSubscriptions(job.userIds),
  ]);

  await Promise.all([
    sendExpoPushDirect(
      expoTokens,
      job.title,
      job.body,
      job.url,
      job.callId ? { type: "call", callId: job.callId } : undefined,
    ),
    sendWebPushDirect(webSubscriptions, {
      title: job.title,
      body: job.body,
      url: job.url,
      conversationId: job.conversationId,
      icon: job.icon ?? null,
      image: job.image ?? null,
    }),
  ]);

  return c.json({ ok: true });
});

internalRouter.post("/jobs/check-updates", async (c) => {
  if (!verifyInternalAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  const result = await runScheduledUpdateCheck();
  return c.json(result);
});

function requireProvisionSecretsForRecovery(): {
  SESSION_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  CF_INTERNAL_SECRET: string;
} {
  const SESSION_SECRET = process.env.SESSION_SECRET?.trim();
  const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const CF_INTERNAL_SECRET = process.env.CF_INTERNAL_SECRET?.trim();
  if (!SESSION_SECRET || !TOKEN_ENCRYPTION_KEY || !CF_INTERNAL_SECRET) {
    throw new Error("Worker platform secrets are not configured");
  }
  return { SESSION_SECRET, TOKEN_ENCRYPTION_KEY, CF_INTERNAL_SECRET };
}

/** Recovery when bootstrap set Secrets Store id but D1 still holds *_enc org secrets. */
internalRouter.post("/migrate-org-secrets-to-store", async (c) => {
  if (!isCloudflareRuntime()) {
    return c.json({ error: "Cloudflare runtime only" }, 400);
  }

  const org = await getConfiguredOrganization();
  if (!org?.cloudflareAccountId) {
    return c.json({ error: "Organization not configured" }, 404);
  }
  if (!organizationHasPendingSecretsStoreMigration(org)) {
    return c.json({ ok: true, migrated: false, reason: "nothing_pending" });
  }

  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    return c.json({ error: "Could not resolve chat/API hostnames" }, 400);
  }

  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return c.json({ error: "Unauthorized" }, 401);

  try {
    await verifyCloudflareUpdateApplyPermissions({
      accountId: org.cloudflareAccountId,
      apiToken: bearer,
      chatHostname: hostnames.chatHostname,
      apiHostname: hostnames.apiHostname,
    });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let platformSecrets;
  try {
    platformSecrets = requireProvisionSecretsForRecovery();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Platform secrets unavailable";
    return c.json({ error: message }, 500);
  }

  try {
    const secretsStoreId = await migrateOrganizationSecretsToStore({
      organizationId: org.id,
      accountId: org.cloudflareAccountId,
      apiToken: bearer,
      platformSecrets,
    });
    return c.json({ ok: true, migrated: true, secretsStoreId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Migration failed";
    console.error("migrate-org-secrets-to-store:", message);
    return c.json({ error: message }, 500);
  }
});

const RecoverPcoClientSecretSchema = z.object({
  pcoClientSecret: z.string().min(1),
});

/** When D1 decrypt fails (TOKEN_ENCRYPTION_KEY rotation), write PCO secret directly to store. */
internalRouter.post("/recover-pco-client-secret", async (c) => {
  if (!isCloudflareRuntime()) {
    return c.json({ error: "Cloudflare runtime only" }, 400);
  }

  const org = await getConfiguredOrganization();
  if (!org?.cloudflareAccountId || !org.cloudflareSecretsStoreId) {
    return c.json({ error: "Organization Secrets Store not configured" }, 404);
  }

  const hostnames = resolveOrgHostnames(org);
  if (!hostnames) {
    return c.json({ error: "Could not resolve chat/API hostnames" }, 400);
  }

  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return c.json({ error: "Unauthorized" }, 401);

  try {
    await verifyCloudflareUpdateApplyPermissions({
      accountId: org.cloudflareAccountId,
      apiToken: bearer,
      chatHostname: hostnames.chatHostname,
      apiHostname: hostnames.apiHostname,
    });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = RecoverPcoClientSecretSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    await upsertOrgSecretForOrganization({
      organizationId: org.id,
      secretName: CCO_STORE_SECRET.PCO_CLIENT_SECRET,
      value: parsed.data.pcoClientSecret.trim(),
      apiToken: bearer,
      configuredPatch: { pcoClientSecretConfigured: true, pcoClientSecretEnc: null },
    });
    return c.json({ ok: true, recovered: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recovery failed";
    console.error("recover-pco-client-secret:", message);
    return c.json({ error: message }, 500);
  }
});

export { internalRouter };
