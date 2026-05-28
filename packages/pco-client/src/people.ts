import type { PlanningCenterClient } from "./client";

type PcoPersonResponse = {
  data?: {
    attributes?: Record<string, unknown>;
  };
};

export function parsePersonAvatarUrl(
  attributes: Record<string, unknown> | undefined,
): string | null {
  if (!attributes) return null;
  const url = attributes.demographic_avatar_url ?? attributes.avatar_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function parsePersonDisplayName(
  attributes: Record<string, unknown> | undefined,
): string | null {
  if (!attributes) return null;
  const firstName =
    typeof attributes.first_name === "string" ? attributes.first_name.trim() : "";
  const lastName =
    typeof attributes.last_name === "string" ? attributes.last_name.trim() : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

export async function fetchPersonAvatarUrl(
  client: PlanningCenterClient,
  personId: string,
): Promise<string | null> {
  const json = await client.get<PcoPersonResponse>(`/people/v2/people/${personId}`);
  return parsePersonAvatarUrl(json.data?.attributes);
}

export async function fetchPersonDisplayName(
  client: PlanningCenterClient,
  personId: string,
): Promise<string | null> {
  const json = await client.get<PcoPersonResponse>(`/people/v2/people/${personId}`);
  return parsePersonDisplayName(json.data?.attributes);
}
