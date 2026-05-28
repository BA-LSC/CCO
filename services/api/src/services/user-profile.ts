import { parsePersonAvatarUrl, PlanningCenterClient, fetchPersonDisplayName } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { db } from "../db";
import { users } from "../db/schema";
import { isPlaceholderDisplayName } from "./cco-member-status";
import { getOrgPcoAccessToken } from "./org-config";

export { isPlaceholderDisplayName };

type PcoMeResponse = {
  data?: {
    attributes?: Record<string, unknown>;
  };
};

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

/** Resolve placeholder roster names from PCO (user token, then org token). */
export async function ensureUserDisplayNameResolved(
  userId: string,
  organizationId?: string,
): Promise<string | null> {
  const existing = await db
    .select({
      displayName: users.displayName,
      pcoPersonId: users.pcoPersonId,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existing[0]) return null;
  if (!isPlaceholderDisplayName(existing[0].displayName)) {
    return existing[0].displayName;
  }

  const fromUserToken = await refreshUserDisplayNameFromPco(userId);
  if (fromUserToken && !isPlaceholderDisplayName(fromUserToken)) {
    return fromUserToken;
  }

  const orgId = organizationId ?? existing[0].organizationId;
  const accessToken = orgId ? await getOrgPcoAccessToken(orgId) : null;
  if (!accessToken) return existing[0].displayName;

  const client = new PlanningCenterClient({ accessToken });
  const displayName = await fetchPersonDisplayName(client, existing[0].pcoPersonId);
  if (!displayName || isPlaceholderDisplayName(displayName)) {
    return existing[0].displayName;
  }

  await db.update(users).set({ displayName }).where(eq(users.id, userId));
  return displayName;
}

export async function resolveDisplayNamesForUsers(
  userIds: string[],
  organizationId?: string,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  const resolved = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (userId) => {
      const displayName = await ensureUserDisplayNameResolved(userId, organizationId);
      if (displayName) resolved.set(userId, displayName);
    }),
  );
  return resolved;
}
