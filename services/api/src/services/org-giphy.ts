import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";

export async function resolveGiphyApiKey(): Promise<string | undefined> {
  const org = await getConfiguredOrganization();
  if (org?.giphyApiKeyEnc) {
    return decryptSecret(org.giphyApiKeyEnc);
  }

  const envKey = process.env.GIPHY_API_KEY?.trim();
  return envKey || undefined;
}

export async function updateOrganizationGiphyApiKey(params: {
  organizationId: string;
  apiKey: string;
}): Promise<void> {
  const trimmed = params.apiKey.trim();
  if (!trimmed) {
    throw new Error("Giphy API key is required");
  }

  await db
    .update(organizations)
    .set({ giphyApiKeyEnc: encryptSecret(trimmed) })
    .where(eq(organizations.id, params.organizationId));
}

export function getOrganizationGiphyStatus(org: typeof organizations.$inferSelect) {
  return {
    giphyApiKeyConfigured: Boolean(org.giphyApiKeyEnc),
  };
}
