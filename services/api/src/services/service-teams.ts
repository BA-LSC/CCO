import { and, eq, inArray } from "drizzle-orm";
import {
  fetchMyServiceTeams,
  fetchServiceTeamRoster,
  PlanningCenterClient,
  removePersonFromServiceTeam,
  resolveServicesPersonId,
  type ServiceTeamWithRole,
} from "@cco/pco-client";
import { db } from "../db";
import {
  conversationMembers,
  conversations,
  serviceTeamMemberships,
  serviceTeams,
  users,
} from "../db/schema";
import { isLeaderRole } from "../permissions";
import {
  buildSignedUpMemberIndex,
  buildSignedUpMemberRecords,
  buildLocalMemberLookups,
  findLocalMember,
  memberIsOnCco,
  resolveRosterMemberLink,
} from "./cco-member-status";
import { reconcileOrgPlaceholderUsers } from "./user-account-merge";
import { unreadFlagsForConversations } from "./unread";

async function upsertServiceTeamMembership(params: {
  teamId: string;
  userId: string;
  role: string;
}): Promise<void> {
  await db
    .insert(serviceTeamMemberships)
    .values({ teamId: params.teamId, userId: params.userId, role: params.role })
    .onConflictDoUpdate({
      target: [serviceTeamMemberships.teamId, serviceTeamMemberships.userId],
      set: { role: params.role, syncedAt: new Date() },
    });
}

export async function persistServiceTeamSync(params: {
  organizationId: string;
  userId: string;
  incoming: ServiceTeamWithRole[];
}): Promise<{ created: number; removed: number }> {
  let created = 0;
  const incomingPcoIds = params.incoming.map((t) => t.pcoTeamId);

  for (const team of params.incoming) {
    const existing = await db
      .select({ id: serviceTeams.id })
      .from(serviceTeams)
      .where(eq(serviceTeams.pcoTeamId, team.pcoTeamId))
      .limit(1);

    let teamId = existing[0]?.id;
    if (!teamId) {
      const [row] = await db
        .insert(serviceTeams)
        .values({
          organizationId: params.organizationId,
          pcoTeamId: team.pcoTeamId,
          name: team.name,
        })
        .returning({ id: serviceTeams.id });
      teamId = row.id;
      created += 1;
    } else {
      await db.update(serviceTeams).set({ name: team.name }).where(eq(serviceTeams.id, teamId));
    }

    await upsertServiceTeamMembership({ teamId, userId: params.userId, role: team.role });

    const conv = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.serviceTeamId, teamId))
      .limit(1);

    if (!conv[0]) {
      const [newConv] = await db
        .insert(conversations)
        .values({
          serviceTeamId: teamId,
          slug: "general",
          title: `${team.name} Chat`,
        })
        .returning({ id: conversations.id });
      await db
        .insert(conversationMembers)
        .values({ conversationId: newConv.id, userId: params.userId })
        .onConflictDoNothing();
    } else {
      await db
        .insert(conversationMembers)
        .values({ conversationId: conv[0].id, userId: params.userId })
        .onConflictDoNothing();
    }
  }

  const userTeams = await db
    .select({ teamId: serviceTeamMemberships.teamId, pcoTeamId: serviceTeams.pcoTeamId })
    .from(serviceTeamMemberships)
    .innerJoin(serviceTeams, eq(serviceTeams.id, serviceTeamMemberships.teamId))
    .where(eq(serviceTeamMemberships.userId, params.userId));

  let removed = 0;
  for (const row of userTeams) {
    if (incomingPcoIds.includes(row.pcoTeamId)) continue;

    const convs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.serviceTeamId, row.teamId));

    for (const conv of convs) {
      await db
        .delete(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, conv.id),
            eq(conversationMembers.userId, params.userId),
          ),
        );
    }

    await db
      .delete(serviceTeamMemberships)
      .where(
        and(eq(serviceTeamMemberships.teamId, row.teamId), eq(serviceTeamMemberships.userId, params.userId)),
      );
    removed += 1;
  }

  return { created, removed };
}

export async function syncServiceTeamsFromPco(params: {
  organizationId: string;
  userId: string;
  accessToken: string;
  pcoPersonId: string;
}): Promise<{ created: number; removed: number; total: number }> {
  const client = new PlanningCenterClient({ accessToken: params.accessToken });
  const incoming = await fetchMyServiceTeams(client, params.pcoPersonId);
  const result = await persistServiceTeamSync({
    organizationId: params.organizationId,
    userId: params.userId,
    incoming,
  });
  return { ...result, total: incoming.length };
}

export async function listServiceTeamsForUser(userId: string) {
  const teams = await db
    .select({
      id: serviceTeams.id,
      name: serviceTeams.name,
      pcoTeamId: serviceTeams.pcoTeamId,
      role: serviceTeamMemberships.role,
    })
    .from(serviceTeams)
    .innerJoin(serviceTeamMemberships, eq(serviceTeamMemberships.teamId, serviceTeams.id))
    .where(eq(serviceTeamMemberships.userId, userId));

  if (teams.length === 0) return [];

  const teamIds = teams.map((team) => team.id);
  const convRows = await db
    .select({ teamId: conversations.serviceTeamId, id: conversations.id })
    .from(conversations)
    .where(inArray(conversations.serviceTeamId, teamIds));

  const convByTeam = new Map(
    convRows
      .filter((row): row is { teamId: string; id: string } => row.teamId !== null)
      .map((row) => [row.teamId, row.id]),
  );
  const convIds = [...convByTeam.values()];
  const unreadByConv = await unreadFlagsForConversations(convIds, userId);

  return teams.map((team) => {
    const conversationId = convByTeam.get(team.id) ?? null;
    return {
      ...team,
      conversationId,
      hasUnread: conversationId ? (unreadByConv.get(conversationId) ?? false) : false,
    };
  });
}

export type TeamMemberView = {
  id?: string;
  pcoPersonId: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
  onCco: boolean;
  email?: string | null;
};

function sortTeamMembersByName(members: TeamMemberView[]): TeamMemberView[] {
  return [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
}

async function listTeamMembersForDetail(params: {
  teamId: string;
  organizationId: string;
  membershipRole: string;
  pcoTeamId: string;
  accessToken?: string;
}): Promise<TeamMemberView[]> {
  await reconcileOrgPlaceholderUsers(params.organizationId);

  const ccoMembers = await db
    .select({
      id: users.id,
      pcoPersonId: users.pcoPersonId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      email: users.email,
      role: serviceTeamMemberships.role,
    })
    .from(serviceTeamMemberships)
    .innerJoin(users, eq(users.id, serviceTeamMemberships.userId))
    .where(eq(serviceTeamMemberships.teamId, params.teamId));

  const [signedUp, signedUpRecords] = await Promise.all([
    buildSignedUpMemberIndex(params.organizationId),
    buildSignedUpMemberRecords(params.organizationId),
  ]);
  const isLeader = isLeaderRole(params.membershipRole);

  if (!isLeader || !params.accessToken) {
    return sortTeamMembersByName(
      ccoMembers.map((member) => ({
        id: member.id,
        pcoPersonId: member.pcoPersonId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        role: member.role,
        onCco: true,
        email: null,
      })),
    );
  }

  try {
    const client = new PlanningCenterClient({ accessToken: params.accessToken });
    const roster = await fetchServiceTeamRoster(client, params.pcoTeamId);
    const localLookups = buildLocalMemberLookups(ccoMembers);

    return sortTeamMembersByName(
      roster.map((person) => {
        const rosterName = person.displayName;
        const local = findLocalMember(
          { pcoPersonId: person.pcoPersonId, email: person.email, displayName: rosterName },
          localLookups,
        );
        const matchPerson = {
          pcoPersonId: person.pcoPersonId,
          email: person.email ?? local?.email,
          displayName: rosterName,
        };
        const link = resolveRosterMemberLink(
          matchPerson,
          local?.id,
          signedUp,
          signedUpRecords,
        );
        return {
          id: link.userId,
          pcoPersonId: person.pcoPersonId,
          displayName: rosterName,
          avatarUrl: local?.avatarUrl ?? person.avatarUrl,
          role: local?.role ?? person.role,
          onCco: link.onCco,
          email: person.email,
        };
      }),
    );
  } catch (err) {
    console.warn(
      "Team roster lookup failed:",
      err instanceof Error ? err.message : err,
    );
    return sortTeamMembersByName(
      ccoMembers.map((member) => ({
        id: member.id,
        pcoPersonId: member.pcoPersonId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        role: member.role,
        onCco: memberIsOnCco(
          {
            pcoPersonId: member.pcoPersonId,
            email: member.email,
            displayName: member.displayName,
          },
          member.id,
          signedUp,
          signedUpRecords,
        ),
        email: null,
      })),
    );
  }
}

export async function getServiceTeamDetail(
  teamId: string,
  userId: string,
  options?: { accessToken?: string; organizationId?: string },
) {
  const membership = await db
    .select({ id: serviceTeamMemberships.id, role: serviceTeamMemberships.role })
    .from(serviceTeamMemberships)
    .where(and(eq(serviceTeamMemberships.teamId, teamId), eq(serviceTeamMemberships.userId, userId)))
    .limit(1);

  if (!membership[0]) return null;

  const team = await db
    .select({ id: serviceTeams.id, name: serviceTeams.name, pcoTeamId: serviceTeams.pcoTeamId })
    .from(serviceTeams)
    .where(eq(serviceTeams.id, teamId))
    .limit(1);

  if (!team[0]) return null;

  let organizationId = options?.organizationId;
  if (!organizationId) {
    const userRow = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    organizationId = userRow[0]?.organizationId ?? "";
  }

  const conv = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      slug: conversations.slug,
      muted: conversationMembers.muted,
    })
    .from(conversations)
    .leftJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, conversations.id),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(eq(conversations.serviceTeamId, teamId))
    .limit(1);

  const members = await listTeamMembersForDetail({
    teamId,
    organizationId,
    membershipRole: membership[0].role,
    pcoTeamId: team[0].pcoTeamId,
    accessToken: options?.accessToken,
  });

  return {
    team: team[0],
    conversation: conv[0]
      ? {
          id: conv[0].id,
          title: conv[0].title,
          slug: conv[0].slug,
          muted: conv[0].muted ?? false,
        }
      : null,
    members,
    membershipRole: membership[0].role,
  };
}

export async function removeMemberFromServiceTeamWithPco(params: {
  teamId: string;
  pcoTeamId: string;
  targetUserId: string;
  accessToken: string;
}): Promise<{ pcoRemoved: boolean }> {
  const userRow = await db
    .select({ pcoPersonId: users.pcoPersonId })
    .from(users)
    .where(eq(users.id, params.targetUserId))
    .limit(1);

  let pcoRemoved = false;
  if (userRow[0]) {
    const client = new PlanningCenterClient({ accessToken: params.accessToken });
    const servicesPersonId = await resolveServicesPersonId(client, userRow[0].pcoPersonId);
    if (servicesPersonId) {
      const result = await removePersonFromServiceTeam(client, params.pcoTeamId, servicesPersonId);
      pcoRemoved = result.removedAssignments > 0;
    }
  }

  await db
    .delete(serviceTeamMemberships)
    .where(
      and(
        eq(serviceTeamMemberships.teamId, params.teamId),
        eq(serviceTeamMemberships.userId, params.targetUserId),
      ),
    );

  const conv = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.serviceTeamId, params.teamId));

  for (const row of conv) {
    await db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, row.id),
          eq(conversationMembers.userId, params.targetUserId),
        ),
      );
  }

  return { pcoRemoved };
}
