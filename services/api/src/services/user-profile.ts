import { parsePersonAvatarUrl } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { db } from "../db";
import { users } from "../db/schema";
import { areOrgWebhooksEnabled } from "./pco-cache";

type PcoMeResponse = {
  data?: {
    attributes?: Record<string, unknown>;
  };
};

export async function refreshUserAvatarFromPco(
  userId: string,
  options?: { force?: boolean },
): Promise<string | null> {
  const existing = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!options?.force) {
    if (await areOrgWebhooksEnabled()) {
      return existing[0]?.avatarUrl ?? null;
    }
    if (existing[0]?.avatarUrl) {
      return existing[0].avatarUrl;
    }
  }

  const token = await getPcoAccessToken(userId);
  if (!token) return existing[0]?.avatarUrl ?? null;

  const response = await fetch("https://api.planningcenteronline.com/people/v2/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const profile = (await response.json()) as PcoMeResponse;
  const avatarUrl = parsePersonAvatarUrl(profile.data?.attributes);
  if (!avatarUrl) return null;

  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  return avatarUrl;
}
