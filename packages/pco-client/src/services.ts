import type { PlanningCenterClient } from "./client";
import { PcoApiError } from "./errors";
import { parsePersonAvatarUrl } from "./people";

type PcoTeamResource = {
  type: string;
  id: string;
  attributes: { name?: string };
};

type PcoListResponse = { data: PcoTeamResource[] };

type PcoAssignmentResource = {
  type: string;
  id: string;
  relationships?: {
    team_position?: { data?: { type?: string; id?: string } };
  };
};

type PcoTeamPositionResource = {
  type: string;
  id: string;
  relationships?: {
    team?: { data?: { type?: string; id?: string } };
  };
};

type PcoAssignmentListResponse = {
  data: PcoAssignmentResource[];
  included?: Array<PcoTeamResource | PcoTeamPositionResource>;
};

type PcoTeamLeaderResource = {
  type: string;
  id: string;
  relationships?: {
    team?: { data?: { type?: string; id?: string } };
  };
};

type PcoTeamLeaderListResponse = {
  data: PcoTeamLeaderResource[];
  included?: PcoTeamResource[];
};

export type SimpleServiceTeam = { pcoTeamId: string; name: string };

export type ServiceTeamWithRole = SimpleServiceTeam & { role: "member" | "leader" };

export function parseServiceTeamsResponse(json: PcoListResponse): SimpleServiceTeam[] {
  return json.data.map((t) => ({
    pcoTeamId: t.id,
    name: t.attributes.name ?? "Unnamed team",
  }));
}

export function parseMyServiceTeamsResponse(json: PcoAssignmentListResponse): ServiceTeamWithRole[] {
  const teamById = new Map<string, PcoTeamResource>();
  const positionToTeamId = new Map<string, string>();

  for (const item of json.included ?? []) {
    if (item.type === "Team") {
      teamById.set(item.id, item as PcoTeamResource);
    }
    if (item.type === "TeamPosition") {
      const position = item as PcoTeamPositionResource;
      const teamId = position.relationships?.team?.data?.id;
      if (teamId) positionToTeamId.set(position.id, teamId);
    }
  }

  const seen = new Set<string>();
  const teams: ServiceTeamWithRole[] = [];

  for (const row of json.data) {
    const positionId = row.relationships?.team_position?.data?.id;
    if (!positionId) continue;
    const teamId = positionToTeamId.get(positionId);
    if (!teamId || seen.has(teamId)) continue;
    seen.add(teamId);
    const team = teamById.get(teamId);
    teams.push({
      pcoTeamId: teamId,
      name: team?.attributes.name ?? "Unnamed team",
      role: "member",
    });
  }

  return teams;
}

export function parseTeamLeadersResponse(json: PcoTeamLeaderListResponse): ServiceTeamWithRole[] {
  const teamById = new Map<string, PcoTeamResource>();
  for (const item of json.included ?? []) {
    if (item.type === "Team") {
      teamById.set(item.id, item);
    }
  }

  const teams: ServiceTeamWithRole[] = [];
  const seen = new Set<string>();

  for (const row of json.data) {
    const teamId = row.relationships?.team?.data?.id;
    if (!teamId || seen.has(teamId)) continue;
    seen.add(teamId);
    const team = teamById.get(teamId);
    teams.push({
      pcoTeamId: teamId,
      name: team?.attributes.name ?? "Unnamed team",
      role: "leader",
    });
  }

  return teams;
}

export function mergeServiceTeams(
  assigned: ServiceTeamWithRole[],
  leading: ServiceTeamWithRole[],
): ServiceTeamWithRole[] {
  const byId = new Map<string, ServiceTeamWithRole>();

  for (const team of assigned) {
    byId.set(team.pcoTeamId, team);
  }

  for (const team of leading) {
    const existing = byId.get(team.pcoTeamId);
    if (existing) {
      byId.set(team.pcoTeamId, { ...existing, role: "leader" });
    } else {
      byId.set(team.pcoTeamId, team);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchServiceTeams(
  client: PlanningCenterClient,
): Promise<SimpleServiceTeam[]> {
  const json = await client.get<PcoListResponse>("/services/v2/teams");
  return parseServiceTeamsResponse(json);
}

type PcoPersonListResponse = { data: Array<{ id: string }> };

/** People and Services share IDs when linked; fall back to legacy_id lookup. */
export async function resolveServicesPersonId(
  client: PlanningCenterClient,
  peoplePersonId: string,
): Promise<string | null> {
  try {
    await client.get(`/services/v2/people/${peoplePersonId}`);
    return peoplePersonId;
  } catch (err) {
    if (!(err instanceof PcoApiError) || err.status !== 404) throw err;
  }

  try {
    const json = await client.get<PcoPersonListResponse>(
      `/services/v2/people?where[legacy_id]=${encodeURIComponent(peoplePersonId)}&per_page=1`,
    );
    return json.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function fetchMyServiceTeams(
  client: PlanningCenterClient,
  pcoPersonId: string,
): Promise<ServiceTeamWithRole[]> {
  const servicesPersonId = await resolveServicesPersonId(client, pcoPersonId);
  if (!servicesPersonId) return [];

  const assignmentsJson = await client.get<PcoAssignmentListResponse>(
    `/services/v2/people/${servicesPersonId}/person_team_position_assignments?include=team_position.team`,
  );

  let leading: ServiceTeamWithRole[] = [];
  try {
    const leadersJson = await client.get<PcoTeamLeaderListResponse>(
      `/services/v2/people/${servicesPersonId}/team_leaders?include=team`,
    );
    leading = parseTeamLeadersResponse(leadersJson);
  } catch (err) {
    if (!(err instanceof PcoApiError) || (err.status !== 403 && err.status !== 404)) {
      throw err;
    }
  }

  return mergeServiceTeams(parseMyServiceTeamsResponse(assignmentsJson), leading);
}

type PcoTeamDetailResponse = {
  data: {
    relationships?: {
      service_type?: { data?: { id?: string } };
    };
  };
  included?: Array<{ type: string; id: string; attributes: { name?: string } }>;
};

export function parseTeamServiceTypesResponse(json: PcoTeamDetailResponse): string[] {
  const serviceTypeId = json.data.relationships?.service_type?.data?.id;
  if (!serviceTypeId) return [];

  const serviceType = json.included?.find(
    (item) => item.type === "ServiceType" && item.id === serviceTypeId,
  );
  const name = serviceType?.attributes?.name?.trim();
  return name ? [name] : [];
}

export async function fetchServiceTypesForTeam(
  client: PlanningCenterClient,
  pcoTeamId: string,
): Promise<string[]> {
  const json = await client.get<PcoTeamDetailResponse>(
    `/services/v2/teams/${pcoTeamId}?include=service_type`,
  );
  return parseTeamServiceTypesResponse(json);
}

type PcoPersonResource = {
  type: string;
  id: string;
  attributes: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
};

export type ServiceTeamRosterMember = {
  pcoPersonId: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: "member" | "leader";
};

function displayNameFromPerson(person?: PcoPersonResource): string {
  if (!person) return "Member";
  const name = [person.attributes.first_name, person.attributes.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "Member";
}

function personMapFromIncluded(included?: PcoPersonResource[]): Map<string, PcoPersonResource> {
  const map = new Map<string, PcoPersonResource>();
  for (const item of included ?? []) {
    if (item.type === "Person") map.set(item.id, item);
  }
  return map;
}

type PcoTeamAssignmentResource = {
  type: string;
  id: string;
  relationships?: {
    person?: { data?: { id?: string } };
    team_position?: { data?: { id?: string } };
  };
};

type PcoTeamAssignmentListResponse = {
  data: PcoTeamAssignmentResource[];
  included?: PcoPersonResource[];
};

type PcoServiceTeamLeaderResource = {
  type: string;
  id: string;
  relationships?: {
    person?: { data?: { id?: string } };
  };
};

type PcoServiceTeamLeaderListResponse = {
  data: PcoServiceTeamLeaderResource[];
  included?: PcoPersonResource[];
};

export function parseServiceTeamAssignmentsRoster(
  json: PcoTeamAssignmentListResponse,
): ServiceTeamRosterMember[] {
  const people = personMapFromIncluded(json.included);
  const roster: ServiceTeamRosterMember[] = [];
  const seen = new Set<string>();

  for (const row of json.data) {
    const pcoPersonId = row.relationships?.person?.data?.id;
    if (!pcoPersonId || seen.has(pcoPersonId)) continue;
    seen.add(pcoPersonId);
    const person = people.get(pcoPersonId);
    roster.push({
      pcoPersonId,
      displayName: displayNameFromPerson(person),
      email: person?.attributes.email ?? null,
      avatarUrl: parsePersonAvatarUrl(person?.attributes as Record<string, unknown>),
      role: "member",
    });
  }

  return roster;
}

export function parseServiceTeamLeadersRoster(
  json: PcoServiceTeamLeaderListResponse,
): ServiceTeamRosterMember[] {
  const people = personMapFromIncluded(json.included);
  const roster: ServiceTeamRosterMember[] = [];
  const seen = new Set<string>();

  for (const row of json.data) {
    const pcoPersonId = row.relationships?.person?.data?.id;
    if (!pcoPersonId || seen.has(pcoPersonId)) continue;
    seen.add(pcoPersonId);
    const person = people.get(pcoPersonId);
    roster.push({
      pcoPersonId,
      displayName: displayNameFromPerson(person),
      email: person?.attributes.email ?? null,
      avatarUrl: parsePersonAvatarUrl(person?.attributes as Record<string, unknown>),
      role: "leader",
    });
  }

  return roster;
}

export function mergeServiceTeamRoster(
  assigned: ServiceTeamRosterMember[],
  leading: ServiceTeamRosterMember[],
): ServiceTeamRosterMember[] {
  const byId = new Map<string, ServiceTeamRosterMember>();

  for (const member of assigned) {
    byId.set(member.pcoPersonId, member);
  }

  for (const member of leading) {
    const existing = byId.get(member.pcoPersonId);
    if (existing) {
      byId.set(member.pcoPersonId, { ...existing, role: "leader" });
    } else {
      byId.set(member.pcoPersonId, member);
    }
  }

  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function fetchServiceTeamRoster(
  client: PlanningCenterClient,
  pcoTeamId: string,
): Promise<ServiceTeamRosterMember[]> {
  const assignmentsJson = await client.get<PcoTeamAssignmentListResponse>(
    `/services/v2/teams/${pcoTeamId}/person_team_position_assignments?include=person,team_position`,
  );

  let leading: ServiceTeamRosterMember[] = [];
  try {
    const leadersJson = await client.get<PcoServiceTeamLeaderListResponse>(
      `/services/v2/teams/${pcoTeamId}/team_leaders?include=person`,
    );
    leading = parseServiceTeamLeadersRoster(leadersJson);
  } catch (err) {
    if (!(err instanceof PcoApiError) || (err.status !== 403 && err.status !== 404)) {
      throw err;
    }
  }

  return mergeServiceTeamRoster(parseServiceTeamAssignmentsRoster(assignmentsJson), leading);
}

/** Remove a person's position assignments for a PCO team (best-effort). */
export async function removePersonFromServiceTeam(
  client: PlanningCenterClient,
  pcoTeamId: string,
  servicesPersonId: string,
): Promise<{ removedAssignments: number }> {
  const teamJson = await client.get<PcoTeamDetailResponse>(
    `/services/v2/teams/${pcoTeamId}?include=service_type`,
  );
  const serviceTypeId = teamJson.data.relationships?.service_type?.data?.id;
  if (!serviceTypeId) return { removedAssignments: 0 };

  const assignmentsJson = await client.get<PcoTeamAssignmentListResponse>(
    `/services/v2/teams/${pcoTeamId}/person_team_position_assignments?include=person,team_position`,
  );

  let removed = 0;
  for (const row of assignmentsJson.data) {
    const personId = row.relationships?.person?.data?.id;
    if (personId !== servicesPersonId) continue;
    const positionId = row.relationships?.team_position?.data?.id;
    if (!positionId) continue;
    await client.delete(
      `/services/v2/service_types/${serviceTypeId}/team_positions/${positionId}/person_team_position_assignments/${row.id}`,
    );
    removed += 1;
  }

  return { removedAssignments: removed };
}
