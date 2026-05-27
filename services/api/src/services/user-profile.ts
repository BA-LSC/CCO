import { parsePersonAvatarUrl } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { db } from "../db";
import { users } from "../db/schema";
import { normalizeMemberDisplayName } from "./cco-member-status";

type PcoMeResponse = {
  data?: {
    attributes?: Record<string, unknown>;
  };
};

export function isPlaceholderDisplayName(displayName: string | null | undefined): boolean {
  const normalized = normalizeMemberDisplayName(displayName);
  return !normalized || normalized === "member" || normalized === "user";
}

function displayNameFromPcoAttributes(attributes: Record<string, unknown> | undefined): string | null {
  const firstName = typeof attributes?.first_name === "string" ? attributes.first_name.trim() : "";
  const lastName = typeof attributes?.last_name === "string" ? attributes.last_name.trim() : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (!name || isPlaceholderDisplayName(name)) return null;
  return name;
}

export async function refreshUserAvatarFromPco(
  userId: string,
  options?: { force?: boolean },
): Promise<string | null> {
  const existing = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!options?.force && existing[0]?.avatarUrl) {
    return existing[0].avatarUrl;
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

export async function refreshUserDisplayNameFromPco(userId: string): Promise<string | null> {
  const existing = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!isPlaceholderDisplayName(existing[0]?.displayName)) {
    return existing[0]?.displayName ?? null;
  }

  const token = await getPcoAccessToken(userId);
  if (!token) return existing[0]?.displayName ?? null;

  const response = await fetch("https://api.planningcenteronline.com/people/v2/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return existing[0]?.displayName ?? null;

  const profile = (await response.json()) as PcoMeResponse;
  const displayName = displayNameFromPcoAttributes(profile.data?.attributes);
  if (!displayName) return existing[0]?.displayName ?? null;

  await db.update(users).set({ displayName }).where(eq(users.id, userId));
  return displayName;
}
