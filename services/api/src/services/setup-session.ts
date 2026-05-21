import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifySetupToken(token: string, storedHash: string): boolean {
  const hash = hashSetupToken(token);
  try {
    return timingSafeEqual(Buffer.from(hash, "utf8"), Buffer.from(storedHash, "utf8"));
  } catch {
    return false;
  }
}

export async function issueSetupSessionToken(organizationId: string): Promise<string> {
  const token = generateSetupToken();
  const hash = hashSetupToken(token);
  await db
    .update(organizations)
    .set({ setupSessionTokenHash: hash })
    .where(eq(organizations.id, organizationId));
  return token;
}

export function isBootstrapAuthorized(bootstrapHeader: string | undefined): boolean {
  const secret = process.env.SETUP_BOOTSTRAP_SECRET?.trim();
  if (!secret || !bootstrapHeader) return false;
  try {
    return timingSafeEqual(
      Buffer.from(bootstrapHeader, "utf8"),
      Buffer.from(secret, "utf8"),
    );
  } catch {
    return false;
  }
}
