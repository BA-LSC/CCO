import { CCO_STORE_SECRET } from "@cco/cloudflare-provision";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../auth/token-crypto";
import { getConfiguredOrganization } from "./org-oauth";
import {
  isGiphyApiKeyConfigured,
  orgUsesSecretsStore,
  upsertOrgSecretForOrganization,
} from "./org-secrets";
import { isCloudflareRuntime } from "../runtime/worker-context";

export async function resolveGiphyApiKey(): Promise<string | undefined> {
  const org = await getConfiguredOrganization();
  if (org && orgUsesSecretsStore(org) && isCloudflareRuntime()) {
    return process.env.GIPHY_API_KEY?.trim() || undefined;
  }
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

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  const org = orgRows[0];

  if (org && orgUsesSecretsStore(org) && isCloudflareRuntime()) {
    await upsertOrgSecretForOrganization({
      organizationId: params.organizationId,
      secretName: CCO_STORE_SECRET.GIPHY_API_KEY,
      value: trimmed,
      configuredPatch: { giphyApiKeyConfigured: true, giphyApiKeyEnc: null },
    });
    return;
  }

  await db
    .update(organizations)
    .set({ giphyApiKeyEnc: encryptSecret(trimmed) })
    .where(eq(organizations.id, params.organizationId));
}

export function getOrganizationGiphyStatus(org: typeof organizations.$inferSelect) {
  return {
    giphyApiKeyConfigured: isGiphyApiKeyConfigured(org),
  };
}
