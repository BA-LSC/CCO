import { eq } from "drizzle-orm";
import { db } from "../db";
import { userPcoCredentials, users } from "../db/schema";

export type SignedUpMemberIndex = {
  pcoPersonIds: Set<string>;
  userIds: Set<string>;
  emails: Set<string>;
};

function normalizeMemberEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || normalized.endsWith("@placeholder.local")) return null;
  return normalized;
}

export async function buildSignedUpMemberIndex(
  organizationId: string,
): Promise<SignedUpMemberIndex> {
  const rows = await db
    .select({
      userId: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
    })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(users.organizationId, organizationId));

  const pcoPersonIds = new Set<string>();
  const userIds = new Set<string>();
  const emails = new Set<string>();

  for (const row of rows) {
    pcoPersonIds.add(row.pcoPersonId);
    userIds.add(row.userId);
    const email = normalizeMemberEmail(row.email);
    if (email) emails.add(email);
  }

  return { pcoPersonIds, userIds, emails };
}

/** True when this PCO roster person has signed into CCO (OAuth credentials on file). */
export function memberIsOnCco(
  person: { pcoPersonId: string; email?: string | null },
  localUserId: string | undefined,
  signedUp: SignedUpMemberIndex,
): boolean {
  if (signedUp.pcoPersonIds.has(person.pcoPersonId)) return true;
  if (localUserId && signedUp.userIds.has(localUserId)) return true;

  const email = normalizeMemberEmail(person.email);
  if (email && signedUp.emails.has(email)) return true;

  return false;
}
