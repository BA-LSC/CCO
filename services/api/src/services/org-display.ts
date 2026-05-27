/** Display name for church/org in sidebar, sign-in, and setup UI. */
export function resolveChurchDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === "Pending setup") return null;
  return trimmed;
}
