import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { organizations, userPcoCredentials, users } from "../db/schema";
import { getConfiguredOrganization } from "./org-oauth";
import { getPcoAccessToken } from "../auth/pco-tokens";
import { decryptWebhookSecrets } from "../webhooks/secrets";

export async function getOrgWebhookSecrets(): Promise<string[]> {
  const org = await getConfiguredOrganization();
  return decryptWebhookSecrets(org?.pcoWebhookSecretEnc);
}

export async function getOrgPcoAccessToken(organizationId: string): Promise<string | null> {
  const orgRow = await db
    .select({ setupByUserId: organizations.setupByUserId })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (orgRow[0]?.setupByUserId) {
    const token = await getPcoAccessToken(orgRow[0].setupByUserId);
    if (token) return token;
  }

  const creds = await db
    .select({ userId: userPcoCredentials.userId })
    .from(userPcoCredentials)
    .innerJoin(users, eq(users.id, userPcoCredentials.userId))
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.siteAdministrator, true),
      ),
    )
    .limit(1);

  if (creds[0]) {
    const token = await getPcoAccessToken(creds[0].userId);
    if (token) return token;
  }

  const anyCred = await db
    .select({ userId: userPcoCredentials.userId })
    .from(userPcoCredentials)
    .innerJoin(users, eq(users.id, userPcoCredentials.userId))
    .where(eq(users.organizationId, organizationId))
    .limit(1);

  if (anyCred[0]) {
    return getPcoAccessToken(anyCred[0].userId);
  }

  return null;
}

export async function findLeaderAccessTokenForGroup(groupId: string): Promise<string | null> {
  const { groupMemberships } = await import("../db/schema");

  const leaders = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, groupId),
        inArray(groupMemberships.role, ["leader", "admin"]),
      ),
    );

  for (const leader of leaders) {
    const token = await getPcoAccessToken(leader.userId);
    if (token) return token;
  }

  return null;
}
