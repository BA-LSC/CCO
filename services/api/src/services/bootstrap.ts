import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations, users } from "../db/schema";

export type PcoProfile = {
  personId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

export async function ensureOrganization(): Promise<string> {
  const pcoOrgId = process.env.PCO_ORGANIZATION_ID ?? "default-org";
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.pcoOrganizationId, pcoOrgId))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(organizations)
    .values({
      name: process.env.ORGANIZATION_NAME ?? "My Church",
      pcoOrganizationId: pcoOrgId,
    })
    .returning({ id: organizations.id });

  return created.id;
}

export async function upsertUserFromPco(
  organizationId: string,
  profile: PcoProfile,
): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.pcoPersonId, profile.personId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({
        email: profile.email,
        displayName: profile.displayName,
        ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {}),
      })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(users)
    .values({
      organizationId,
      pcoPersonId: profile.personId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    })
    .returning({ id: users.id });

  return created.id;
}
