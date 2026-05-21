import { parsePersonAvatarUrl } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { db } from "../db";
import { users } from "../db/schema";

type PcoMeResponse = {
  data?: {
    attributes?: Record<string, unknown>;
  };
};

export async function refreshUserAvatarFromPco(userId: string): Promise<string | null> {
  const token = await getPcoAccessToken(userId);
  if (!token) return null;

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
