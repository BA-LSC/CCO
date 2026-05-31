import webpush from "web-push";
import { CCO_STORE_SECRET } from "@cco/cloudflare-provision";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";
import {
  isVapidPrivateKeyConfigured,
  orgUsesSecretsStore,
  upsertOrgSecretForOrganization,
} from "./org-secrets";
import { getWorkerEnvVar, isCloudflareRuntime } from "../runtime/worker-context";
import { invalidateOrgContextCache } from "./org-context-cache";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeVapidSubject(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("VAPID contact email is required");
  }

  const email = trimmed.startsWith("mailto:") ? trimmed.slice("mailto:".length).trim() : trimmed;
  if (!EMAIL_RE.test(email)) {
    throw new Error("Invalid VAPID contact email");
  }

  return `mailto:${email}`;
}

export function parseVapidSubjectEmail(subject: string | null | undefined): string {
  if (!subject) return "";
  return subject.startsWith("mailto:") ? subject.slice("mailto:".length) : subject;
}

/** Default VAPID contact when org keys exist but no subject was saved (greenfield installs). */
export function defaultVapidSubject(): string {
  const webUrl = getWorkerEnvVar("WEB_URL")?.trim() || process.env.WEB_URL?.trim();
  if (webUrl) {
    try {
      return normalizeVapidSubject(`support@${new URL(webUrl).hostname}`);
    } catch {
      // Fall through to static default below.
    }
  }
  return "mailto:support@example.com";
}

async function ensureDefaultVapidSubject(organizationId: string, subject: string | null): Promise<void> {
  if (subject?.trim()) return;

  await db
    .update(organizations)
    .set({ vapidSubject: defaultVapidSubject() })
    .where(eq(organizations.id, organizationId));
  invalidateOrgContextCache();
}

export async function ensureVapidKeys(
  organizationId: string,
  options?: { cloudflareApiToken?: string },
): Promise<void> {
  const rows = await db
    .select({
      vapidPublicKey: organizations.vapidPublicKey,
      vapidSubject: organizations.vapidSubject,
      vapidPrivateKeyEnc: organizations.vapidPrivateKeyEnc,
      vapidPrivateKeyConfigured: organizations.vapidPrivateKeyConfigured,
      cloudflareSecretsStoreId: organizations.cloudflareSecretsStoreId,
      cloudflarePlatformProvisionedAt: organizations.cloudflarePlatformProvisionedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  const org = rows[0];
  if (!org) return;

  if (isVapidPrivateKeyConfigured(org)) {
    await ensureDefaultVapidSubject(organizationId, org.vapidSubject);
    return;
  }

  const keys = webpush.generateVAPIDKeys();
  const vapidSubject = org.vapidSubject?.trim() ? org.vapidSubject : defaultVapidSubject();

  if (orgUsesSecretsStore(org) && isCloudflareRuntime()) {
    await db
      .update(organizations)
      .set({
        vapidPublicKey: keys.publicKey,
        vapidSubject,
        vapidPrivateKeyConfigured: true,
        vapidPrivateKeyEnc: null,
      })
      .where(eq(organizations.id, organizationId));
    invalidateOrgContextCache();

    await upsertOrgSecretForOrganization({
      organizationId,
      secretName: CCO_STORE_SECRET.VAPID_PRIVATE_KEY,
      value: keys.privateKey,
      apiToken: options?.cloudflareApiToken,
      configuredPatch: { vapidPrivateKeyConfigured: true, vapidPrivateKeyEnc: null },
    });
    return;
  }

  await db
    .update(organizations)
    .set({
      vapidPublicKey: keys.publicKey,
      vapidSubject,
      vapidPrivateKeyEnc: encryptSecret(keys.privateKey),
    })
    .where(eq(organizations.id, organizationId));
  invalidateOrgContextCache();
}

export async function updateOrganizationVapidSubject(params: {
  organizationId: string;
  subjectEmail: string;
  cloudflareApiToken?: string;
}): Promise<void> {
  await ensureVapidKeys(params.organizationId, {
    cloudflareApiToken: params.cloudflareApiToken,
  });

  await db
    .update(organizations)
    .set({ vapidSubject: normalizeVapidSubject(params.subjectEmail) })
    .where(eq(organizations.id, params.organizationId));
}

function envVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    (process.env.WEB_URL ? `mailto:support@${new URL(process.env.WEB_URL).hostname}` : null) ||
    "mailto:support@example.com";

  return { publicKey, privateKey, subject };
}

function orgVapidConfig(org: typeof organizations.$inferSelect): VapidConfig | null {
  if (!org.vapidPublicKey) return null;

  const subject = org.vapidSubject?.trim() || defaultVapidSubject();

  if (orgUsesSecretsStore(org) && isCloudflareRuntime()) {
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!privateKey) return null;
    return {
      publicKey: org.vapidPublicKey,
      privateKey,
      subject,
    };
  }

  if (!org.vapidPrivateKeyEnc) return null;

  return {
    publicKey: org.vapidPublicKey,
    privateKey: decryptSecret(org.vapidPrivateKeyEnc),
    subject,
  };
}

export async function resolveVapidConfig(): Promise<VapidConfig | null> {
  const org = await getConfiguredOrganization();
  if (org) {
    const fromOrg = orgVapidConfig(org);
    if (fromOrg) return fromOrg;
  }

  return envVapidConfig();
}

export async function getOrganizationVapidStatus(org: typeof organizations.$inferSelect) {
  const keysConfigured = isVapidPrivateKeyConfigured(org) && Boolean(org.vapidPublicKey);
  const subjectEmail =
    parseVapidSubjectEmail(org.vapidSubject) ||
    (keysConfigured ? parseVapidSubjectEmail(defaultVapidSubject()) : "");
  return {
    vapidKeysConfigured: keysConfigured,
    vapidSubjectEmail: subjectEmail,
    webPushConfigured: keysConfigured,
  };
}
