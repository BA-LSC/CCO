export function parsePersonAvatarUrl(
  attributes: Record<string, unknown> | undefined,
): string | null {
  if (!attributes) return null;
  const url = attributes.demographic_avatar_url ?? attributes.avatar_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}
