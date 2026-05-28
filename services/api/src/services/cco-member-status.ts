import { eq } from "drizzle-orm";
import { db } from "../db";
import { groupMemberships, serviceTeamMemberships, userPcoCredentials, users } from "../db/schema";

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
  const normalized = displayName
    ?.trim()
    .toLowerCase()
    .replace(/[''.`-]/g, "")
    .replace(/\s+/g, " ");
  return normalized || null;
}

export function isPlaceholderDisplayName(displayName: string | null | undefined): boolean {
  const normalized = normalizeMemberDisplayName(displayName);
  return !normalized || normalized === "member" || normalized === "user";
}

export type MemberMatchPerson = {
  pcoPersonId: string;
  email?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type RosterMemberLink = {
  onCco: boolean;
  userId?: string;
};

function personDisplayNameCandidates(person: MemberMatchPerson): string[] {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizeMemberDisplayName(value);
    if (normalized) names.add(normalized);
  };

  add(person.displayName);
  if (person.firstName && person.lastName) {
    add(`${person.firstName} ${person.lastName}`);
  }

  return [...names];
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

  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const lastA = tokensA[tokensA.length - 1]!;
    const lastB = tokensB[tokensB.length - 1]!;
    if (lastA === lastB && lastA.length > 1) {
      const firstA = tokensA[0]!;
      const firstB = tokensB[0]!;
      if (firstA === firstB || firstA[0] === firstB[0]) return true;
    }
  }

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

  return mapSignedUpMemberRows(rows);
}

/** Every user with PCO OAuth credentials (any org). Used to match roster placeholders to real accounts. */
export async function buildAllSignedUpMemberRecords(): Promise<SignedUpMemberRecord[]> {
  const rows = await db
    .select({
      userId: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id));

  return mapSignedUpMemberRows(rows);
}

function mapSignedUpMemberRows(
  rows: Array<{
    userId: string;
    pcoPersonId: string;
    email: string;
    displayName: string;
  }>,
): SignedUpMemberRecord[] {
  return rows.map((row) => ({
    userId: row.userId,
    pcoPersonId: row.pcoPersonId,
    email: normalizeMemberEmail(row.email),
    displayName: normalizeMemberDisplayName(row.displayName),
  }));
}

/** Signed-up users in a group, regardless of organization (handles legacy split accounts). */
export async function buildSignedUpMemberRecordsForGroup(
  groupId: string,
): Promise<SignedUpMemberRecord[]> {
  const rows = await db
    .select({
      userId: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(groupMemberships.groupId, groupId));

  return mapSignedUpMemberRows(rows);
}

/** Signed-up users on a service team, regardless of organization. */
export async function buildSignedUpMemberRecordsForTeam(
  teamId: string,
): Promise<SignedUpMemberRecord[]> {
  const rows = await db
    .select({
      userId: users.id,
      pcoPersonId: users.pcoPersonId,
      email: users.email,
      displayName: users.displayName,
    })
    .from(serviceTeamMemberships)
    .innerJoin(users, eq(users.id, serviceTeamMemberships.userId))
    .innerJoin(userPcoCredentials, eq(userPcoCredentials.userId, users.id))
    .where(eq(serviceTeamMemberships.teamId, teamId));

  return mapSignedUpMemberRows(rows);
}

export function mergeSignedUpMemberRecords(
  ...lists: SignedUpMemberRecord[][]
): SignedUpMemberRecord[] {
  const merged = new Map<string, SignedUpMemberRecord>();
  for (const list of lists) {
    for (const record of list) {
      merged.set(record.userId, record);
    }
  }
  return [...merged.values()];
}

export function buildSignedUpMemberIndexFromRecords(
  records: SignedUpMemberRecord[],
): SignedUpMemberIndex {
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

export async function buildSignedUpMemberIndex(
  organizationId: string,
): Promise<SignedUpMemberIndex> {
  return buildSignedUpMemberIndexFromRecords(await buildSignedUpMemberRecords(organizationId));
}

export function findSignedUpMember(
  person: MemberMatchPerson,
  records: SignedUpMemberRecord[],
): SignedUpMemberRecord | undefined {
  const byPcoId = records.find((record) => record.pcoPersonId === person.pcoPersonId);
  if (byPcoId) return byPcoId;

  const email = normalizeMemberEmail(person.email);
  if (email) {
    const byEmail = records.find((record) => record.email === email);
    if (byEmail) return byEmail;
  }

  for (const candidateName of personDisplayNameCandidates(person)) {
    const exact = records.find((record) => record.displayName === candidateName);
    if (exact) return exact;

    const fuzzy = records.find((record) =>
      namesLikelyMatch(candidateName, record.displayName),
    );
    if (fuzzy) return fuzzy;
  }

  return undefined;
}

/** Links a PCO roster person to a signed-up CCO user when ids differ (placeholder roster rows). */
export function resolveRosterMemberLink(
  person: MemberMatchPerson,
  localUserId: string | undefined,
  signedUp: SignedUpMemberIndex,
  signedUpRecords: SignedUpMemberRecord[],
): RosterMemberLink {
  const signedUpMember = findSignedUpMember(person, signedUpRecords);
  if (signedUpMember) {
    return { onCco: true, userId: signedUpMember.userId };
  }

  if (localUserId && signedUp.userIds.has(localUserId)) {
    return { onCco: true, userId: localUserId };
  }

  const onCco = memberIsOnCco(person, undefined, signedUp, signedUpRecords);
  return { onCco, userId: onCco ? localUserId : undefined };
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
  person: MemberMatchPerson,
  localUserId: string | undefined,
  signedUp: SignedUpMemberIndex,
  signedUpRecords?: SignedUpMemberRecord[],
): boolean {
  if (signedUp.pcoPersonIds.has(person.pcoPersonId)) return true;
  if (localUserId && signedUp.userIds.has(localUserId)) return true;

  const email = normalizeMemberEmail(person.email);
  if (email && signedUp.emails.has(email)) return true;

  for (const candidateName of personDisplayNameCandidates(person)) {
    if (signedUp.displayNames.has(candidateName)) return true;
  }

  if (signedUpRecords && findSignedUpMember(person, signedUpRecords)) return true;

  return false;
}
