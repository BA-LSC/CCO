import { eq } from "drizzle-orm";
import { db } from "../db";
import { userPcoCredentials, users } from "../db/schema";

export type SignedUpMemberRecord = {
  userId: string;
  pcoPersonId: string;
  email: string | null;
  displayName: string | null;
};

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

function nameTokens(name: string | null | undefined): string[] {
  const normalized = normalizeMemberDisplayName(name);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

/** Loose match for roster vs OAuth display names (middle names, nicknames). */
export function namesLikelyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const tokensA = nameTokens(a);
  const tokensB = nameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const setB = new Set(tokensB);
  let overlap = 0;
  for (const token of tokensA) {
    if (setB.has(token)) overlap += 1;
  }

  if (overlap >= 2) return true;
  if (overlap >= 1 && (tokensA.length === 1 || tokensB.length === 1)) return true;
  return false;
}

export async function buildSignedUpMemberRecords(
  organizationId: string,
): Promise<SignedUpMemberRecord[]> {
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

  return rows.map((row) => ({
    userId: row.userId,
    pcoPersonId: row.pcoPersonId,
    email: normalizeMemberEmail(row.email),
    displayName: normalizeMemberDisplayName(row.displayName),
  }));
}

export async function buildSignedUpMemberIndex(
  organizationId: string,
): Promise<SignedUpMemberIndex> {
  const records = await buildSignedUpMemberRecords(organizationId);
  const pcoPersonIds = new Set<string>();
  const userIds = new Set<string>();
  const emails = new Set<string>();
  const displayNames = new Set<string>();

  for (const row of records) {
    pcoPersonIds.add(row.pcoPersonId);
    userIds.add(row.userId);
    if (row.email) emails.add(row.email);
    if (row.displayName) displayNames.add(row.displayName);
  }

  return { pcoPersonIds, userIds, emails, displayNames };
}

export function findSignedUpMember(
  person: {
    pcoPersonId: string;
    email?: string | null;
    displayName?: string | null;
  },
  records: SignedUpMemberRecord[],
): SignedUpMemberRecord | undefined {
  const byPcoId = records.find((record) => record.pcoPersonId === person.pcoPersonId);
  if (byPcoId) return byPcoId;

  const email = normalizeMemberEmail(person.email);
  if (email) {
    const byEmail = records.find((record) => record.email === email);
    if (byEmail) return byEmail;
  }

  const displayName = normalizeMemberDisplayName(person.displayName);
  if (displayName) {
    const exact = records.find((record) => record.displayName === displayName);
    if (exact) return exact;

    const fuzzy = records.find((record) => namesLikelyMatch(displayName, record.displayName));
    if (fuzzy) return fuzzy;
  }

  return undefined;
}

export type LocalMemberLookups<T> = {
  byPcoId: Map<string, T>;
  byEmail: Map<string, T>;
  byDisplayName: Map<string, T>;
};

export function buildLocalMemberLookups<
  T extends { pcoPersonId: string; email?: string | null; displayName?: string | null },
>(members: T[]): LocalMemberLookups<T> {
  const byPcoId = new Map(members.map((member) => [member.pcoPersonId, member]));
  const byEmail = new Map<string, T>();
  const byDisplayName = new Map<string, T>();

  for (const member of members) {
    const email = normalizeMemberEmail(member.email);
    if (email) byEmail.set(email, member);
    const displayName = normalizeMemberDisplayName(member.displayName);
    if (displayName) byDisplayName.set(displayName, member);
  }

  return { byPcoId, byEmail, byDisplayName };
}

export function findLocalMember<
  T extends { pcoPersonId: string; email?: string | null; displayName?: string | null },
>(
  person: { pcoPersonId: string; email?: string | null; displayName?: string | null },
  lookups: LocalMemberLookups<T>,
): T | undefined {
  const email = person.email ? normalizeMemberEmail(person.email) : null;
  const displayName = person.displayName ? normalizeMemberDisplayName(person.displayName) : null;

  return (
    lookups.byPcoId.get(person.pcoPersonId) ??
    (email ? lookups.byEmail.get(email) : undefined) ??
    (displayName ? lookups.byDisplayName.get(displayName) : undefined)
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
  signedUpRecords?: SignedUpMemberRecord[],
): boolean {
  if (signedUp.pcoPersonIds.has(person.pcoPersonId)) return true;
  if (localUserId && signedUp.userIds.has(localUserId)) return true;

  const email = normalizeMemberEmail(person.email);
  if (email && signedUp.emails.has(email)) return true;

  const displayName = normalizeMemberDisplayName(person.displayName);
  if (displayName && signedUp.displayNames.has(displayName)) return true;

  if (signedUpRecords && findSignedUpMember(person, signedUpRecords)) return true;

  return false;
}
