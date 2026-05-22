import type { PlanningCenterClient } from "./client";
import { PcoApiError } from "./errors";
import { parsePersonAvatarUrl } from "./people";

type PcoGroupResource = {
  type: string;
  id: string;
  attributes: { name?: string; header_image?: unknown };
};

type PcoListResponse = { data: PcoGroupResource[] };

export type SimpleGroup = { pcoGroupId: string; name: string; imageUrl?: string | null };

const GROUP_IMAGE_KEYS = ["thumbnail", "medium", "original", "url", "default"] as const;

function pickImageUrl(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return null;
}

function findGroupImageUrl(value: unknown, depth = 0): string | null {
  if (depth > 6) return null;
  const direct = pickImageUrl(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  for (const key of GROUP_IMAGE_KEYS) {
    const url = findGroupImageUrl(obj[key], depth + 1);
    if (url) return url;
  }
  for (const nested of Object.values(obj)) {
    const url = findGroupImageUrl(nested, depth + 1);
    if (url) return url;
  }
  return null;
}

export function parseGroupHeaderImageUrl(headerImage: unknown): string | null {
  return findGroupImageUrl(headerImage);
}

function parseGroupResource(resource: PcoGroupResource): SimpleGroup {
  return {
    pcoGroupId: resource.id,
    name: resource.attributes.name ?? "Unnamed group",
    imageUrl: parseGroupHeaderImageUrl(resource.attributes.header_image),
  };
}

export type GroupMembership = { pcoGroupId: string; role: string };

export type GroupRosterMember = {
  pcoPersonId: string;
  role: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string | null;
};

type PcoMembershipResource = {
  type: string;
  id: string;
  attributes: { role?: string; person_id?: string; group_id?: string };
  relationships?: {
    group?: { data?: { id?: string } };
    person?: { data?: { id?: string } };
  };
};

export type MembershipWebhookPayload = {
  data: PcoMembershipResource;
  included?: Array<{
    type: string;
    id: string;
    attributes?: {
      first_name?: string;
      last_name?: string;
      email?: string;
      name?: string;
    };
  }>;
};

export type ParsedMembershipWebhook = {
  pcoPersonId: string;
  pcoGroupId: string;
  role: string;
  displayName?: string;
  email?: string;
};

/** PCO membership webhooks put person/group IDs in relationships, not attributes. */
export function parseMembershipWebhookPayload(
  payload: MembershipWebhookPayload,
): ParsedMembershipWebhook | null {
  const data = payload.data;
  const attrs = data?.attributes ?? {};
  const rels = data?.relationships ?? {};

  const pcoPersonId = rels.person?.data?.id ?? attrs.person_id;
  const pcoGroupId = rels.group?.data?.id ?? attrs.group_id;
  if (!pcoPersonId || !pcoGroupId) return null;

  const role = mapPcoMembershipRole(attrs.role);

  let displayName: string | undefined;
  let email: string | undefined;
  for (const item of payload.included ?? []) {
    if (item.type === "Person" && item.id === pcoPersonId) {
      const personAttrs = item.attributes ?? {};
      displayName =
        [personAttrs.first_name, personAttrs.last_name].filter(Boolean).join(" ").trim() ||
        personAttrs.name ||
        undefined;
      email = personAttrs.email;
      break;
    }
  }

  return { pcoPersonId, pcoGroupId, role, displayName, email };
}

type PcoPersonResource = {
  type: string;
  id: string;
  attributes: {
    first_name?: string;
    last_name?: string;
    email?: string;
    demographic_avatar_url?: string;
    avatar_url?: string;
  };
};

type PcoMembershipListResponse = {
  data: PcoMembershipResource[];
  included?: Array<PcoGroupResource | PcoPersonResource>;
};

export function parseGroupsListResponse(json: PcoListResponse): SimpleGroup[] {
  return json.data.map(parseGroupResource);
}

type PcoGroupResponse = { data: PcoGroupResource };

export async function fetchGroup(
  client: PlanningCenterClient,
  pcoGroupId: string,
): Promise<SimpleGroup> {
  const json = await client.get<PcoGroupResponse>(`/groups/v2/groups/${pcoGroupId}`);
  return parseGroupResource(json.data);
}

export async function enrichGroupsWithImages(
  client: PlanningCenterClient,
  groups: SimpleGroup[],
): Promise<SimpleGroup[]> {
  return Promise.all(
    groups.map(async (group) => {
      if (group.imageUrl) return group;
      try {
        const detail = await fetchGroup(client, group.pcoGroupId);
        return { ...group, imageUrl: detail.imageUrl ?? null };
      } catch {
        return group;
      }
    }),
  );
}

export function mapPcoMembershipRole(role: string | undefined): string {
  const normalized = (role ?? "member").toLowerCase();
  if (normalized.includes("leader")) return "leader";
  if (normalized === "admin") return "admin";
  return "member";
}

export async function fetchMyGroups(client: PlanningCenterClient): Promise<SimpleGroup[]> {
  const json = await client.get<PcoListResponse>("/groups/v2/groups?filter=my_groups");
  return parseGroupsListResponse(json);
}

export function parseMyGroupMemberships(
  json: PcoMembershipListResponse,
  personId: string,
): GroupMembership[] {
  const groupNameById = new Map<string, string>();
  for (const item of json.included ?? []) {
    if (item.type === "Group") {
      const group = item as PcoGroupResource;
      groupNameById.set(group.id, group.attributes.name ?? "");
    }
  }

  const memberships: GroupMembership[] = [];
  for (const row of json.data) {
    const groupId = row.relationships?.group?.data?.id;
    const rowPersonId = row.relationships?.person?.data?.id;
    if (!groupId) continue;
    if (rowPersonId && rowPersonId !== personId) continue;
    memberships.push({
      pcoGroupId: groupId,
      role: mapPcoMembershipRole(row.attributes.role),
    });
  }

  return memberships;
}

export async function fetchMyRoleInGroup(
  client: PlanningCenterClient,
  pcoGroupId: string,
  pcoPersonId: string,
): Promise<string> {
  const json = await client.get<PcoMembershipListResponse>(
    `/groups/v2/groups/${pcoGroupId}/memberships?include=person`,
  );

  for (const row of json.data) {
    const personId = row.relationships?.person?.data?.id;
    if (personId === pcoPersonId) {
      return mapPcoMembershipRole(row.attributes.role);
    }
  }

  return "member";
}

export async function fetchMyRolesForGroups(
  client: PlanningCenterClient,
  pcoPersonId: string,
  pcoGroupIds: string[],
): Promise<GroupMembership[]> {
  const memberships: GroupMembership[] = [];

  for (const pcoGroupId of pcoGroupIds) {
    try {
      const role = await fetchMyRoleInGroup(client, pcoGroupId, pcoPersonId);
      memberships.push({ pcoGroupId, role });
    } catch {
      memberships.push({ pcoGroupId, role: "member" });
    }
  }

  return memberships;
}

export async function fetchMyGroupRoles(
  client: PlanningCenterClient,
  personId: string,
  groups: SimpleGroup[],
): Promise<GroupMembership[]> {
  let memberships = await fetchMyGroupMemberships(client, personId);
  const roleByGroup = new Map(memberships.map((m) => [m.pcoGroupId, m.role]));
  const missingGroupIds = groups
    .map((group) => group.pcoGroupId)
    .filter((pcoGroupId) => !roleByGroup.has(pcoGroupId));

  if (missingGroupIds.length > 0) {
    const extra = await fetchMyRolesForGroups(client, personId, missingGroupIds);
    memberships = [...memberships, ...extra];
  } else if (memberships.length === 0 && groups.length > 0) {
    memberships = await fetchMyRolesForGroups(
      client,
      personId,
      groups.map((group) => group.pcoGroupId),
    );
  }

  return memberships;
}

export async function fetchMyGroupMemberships(
  client: PlanningCenterClient,
  personId: string,
): Promise<GroupMembership[]> {
  const paths = [
    `/groups/v2/people/${personId}/memberships?include=group`,
    `/groups/v2/people/${personId}/group_memberships?include=group`,
  ];

  for (const path of paths) {
    try {
      const json = await client.get<PcoMembershipListResponse>(path);
      return parseMyGroupMemberships(json, personId);
    } catch (err) {
      if (err instanceof PcoApiError && err.status === 404) continue;
      throw err;
    }
  }

  return [];
}

export function parseGroupRoster(json: PcoMembershipListResponse): GroupRosterMember[] {
  const peopleById = new Map<string, PcoPersonResource>();
  for (const item of json.included ?? []) {
    if (item.type === "Person") {
      const person = item as PcoPersonResource;
      peopleById.set(person.id, person);
    }
  }

  const roster: GroupRosterMember[] = [];
  for (const row of json.data) {
    const pcoPersonId = row.relationships?.person?.data?.id;
    if (!pcoPersonId) continue;
    const person = peopleById.get(pcoPersonId);
    roster.push({
      pcoPersonId,
      role: mapPcoMembershipRole(row.attributes.role),
      firstName: person?.attributes.first_name,
      lastName: person?.attributes.last_name,
      email: person?.attributes.email,
      avatarUrl: parsePersonAvatarUrl(person?.attributes as Record<string, unknown> | undefined),
    });
  }

  return roster;
}

export async function fetchGroupRoster(
  client: PlanningCenterClient,
  pcoGroupId: string,
): Promise<GroupRosterMember[]> {
  const json = await client.get<PcoMembershipListResponse>(
    `/groups/v2/groups/${pcoGroupId}/memberships?include=person`,
  );
  return parseGroupRoster(json);
}

export async function findGroupMembershipId(
  client: PlanningCenterClient,
  pcoGroupId: string,
  pcoPersonId: string,
): Promise<string | null> {
  const json = await client.get<PcoMembershipListResponse>(
    `/groups/v2/groups/${pcoGroupId}/memberships?include=person`,
  );

  for (const row of json.data) {
    const personId = row.relationships?.person?.data?.id;
    if (personId === pcoPersonId) return row.id;
  }

  return null;
}

export async function deleteGroupMembership(
  client: PlanningCenterClient,
  pcoGroupId: string,
  pcoMembershipId: string,
): Promise<void> {
  await client.delete(`/groups/v2/groups/${pcoGroupId}/memberships/${pcoMembershipId}`);
}
