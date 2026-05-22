import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";

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

export async function ensureVapidKeys(organizationId: string): Promise<void> {
  const rows = await db
    .select({
      vapidPublicKey: organizations.vapidPublicKey,
      vapidPrivateKeyEnc: organizations.vapidPrivateKeyEnc,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (rows[0]?.vapidPublicKey && rows[0]?.vapidPrivateKeyEnc) return;

  const keys = webpush.generateVAPIDKeys();
  await db
    .update(organizations)
    .set({
      vapidPublicKey: keys.publicKey,
      vapidPrivateKeyEnc: encryptSecret(keys.privateKey),
    })
    .where(eq(organizations.id, organizationId));
}

export async function updateOrganizationVapidSubject(params: {
  organizationId: string;
  subjectEmail: string;
}): Promise<void> {
  await ensureVapidKeys(params.organizationId);

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
  if (!org.vapidPublicKey || !org.vapidPrivateKeyEnc || !org.vapidSubject) return null;

  return {
    publicKey: org.vapidPublicKey,
    privateKey: decryptSecret(org.vapidPrivateKeyEnc),
    subject: org.vapidSubject,
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
  const keysConfigured = Boolean(org.vapidPublicKey && org.vapidPrivateKeyEnc);
  const subjectEmail = parseVapidSubjectEmail(org.vapidSubject);
  return {
    vapidKeysConfigured: keysConfigured,
    vapidSubjectEmail: subjectEmail,
    webPushConfigured: keysConfigured && Boolean(org.vapidSubject),
  };
}
