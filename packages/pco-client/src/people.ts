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

export async function fetchPersonAvatarUrl(
  client: PlanningCenterClient,
  personId: string,
): Promise<string | null> {
  const json = await client.get<PcoPersonResponse>(`/people/v2/people/${personId}`);
  return parsePersonAvatarUrl(json.data?.attributes);
}
