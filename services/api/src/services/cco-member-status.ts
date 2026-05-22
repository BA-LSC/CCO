import { eq } from "drizzle-orm";
import { db } from "../db";
import { userPcoCredentials, users } from "../db/schema";

export type SignedUpMemberIndex = {
  pcoPersonIds: Set<string>;
  userIds: Set<string>;
  emails: Set<string>;
  displayNames: Set<string>;
};

export function normalizeMemberEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || normalized.endsWith("@placeholder.local")) return null;
  return normalized;
}

export function normalizeMemberDisplayName(displayName: string | null | undefined): string | null {
  const normalized = displayName?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

export async function buildSignedUpMemberIndex(
  organizationId: string,
): Promise<SignedUpMemberIndex> {
  const rows = await db
    .select({
      userId: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(users.organizationId, organizationId));

  const pcoPersonIds = new Set<string>();
  const userIds = new Set<string>();
  const emails = new Set<string>();
  const displayNames = new Set<string>();

  for (const row of rows) {
    pcoPersonIds.add(row.pcoPersonId);
    userIds.add(row.userId);
    const email = normalizeMemberEmail(row.email);
    if (email) emails.add(email);
    const displayName = normalizeMemberDisplayName(row.displayName);
    if (displayName) displayNames.add(displayName);
  }

  return { pcoPersonIds, userIds, emails, displayNames };
}

export type LocalMemberLookups<T> = {
  byPcoId: Map<string, T>;
  byEmail: Map<string, T>;
};

export function buildLocalMemberLookups<
  T extends { pcoPersonId: string; email?: string | null },
>(members: T[]): LocalMemberLookups<T> {
  const byPcoId = new Map(members.map((member) => [member.pcoPersonId, member]));
  const byEmail = new Map<string, T>();

  for (const member of members) {
    const email = normalizeMemberEmail(member.email);
    if (email) byEmail.set(email, member);
  }

  return { byPcoId, byEmail };
}

export function findLocalMember<T extends { pcoPersonId: string; email?: string | null }>(
  person: { pcoPersonId: string; email?: string | null },
  lookups: LocalMemberLookups<T>,
): T | undefined {
  const byEmail = person.email ? normalizeMemberEmail(person.email) : null;
  return (
    lookups.byPcoId.get(person.pcoPersonId) ?? (byEmail ? lookups.byEmail.get(byEmail) : undefined)
  );
}

/** True when this PCO roster person has signed into CCO (OAuth credentials on file). */
export function memberIsOnCco(
  person: {
    pcoPersonId: string;
    email?: string | null;
    displayName?: string | null;
  },
  localUserId: string | undefined,
  signedUp: SignedUpMemberIndex,
): boolean {
  if (signedUp.pcoPersonIds.has(person.pcoPersonId)) return true;
  if (localUserId && signedUp.userIds.has(localUserId)) return true;

  const email = normalizeMemberEmail(person.email);
  if (email && signedUp.emails.has(email)) return true;

  const displayName = normalizeMemberDisplayName(person.displayName);
  if (displayName && signedUp.displayNames.has(displayName)) return true;

  return false;
}
