export const ORG_MIGRATIONS_0021_0023_MESSAGE =
  "Database is missing recent API migrations. Run migrations 0021–0023 (./deploy/compose.sh run --rm migrate), then try again.";

const EXTENDED_ORG_COLUMN_MARKERS = [
  "cloudflare_account_id",
  "cloudflare_api_token_enc",
  "realtime_kit_",
  "pco_last_synced_at",
] as const;

function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    parts.push(current.message);
    current = current.cause;
  }

  if (current != null && !(current instanceof Error)) {
    parts.push(String(current));
  } else if (typeof err === "string") {
    parts.push(err);
  }

  return parts.join("\n");
}

function mentionsExtendedOrgColumn(message: string): boolean {
  return EXTENDED_ORG_COLUMN_MARKERS.some((marker) => message.includes(marker));
}

export function isMissingOrgMigrationColumnsError(err: unknown): boolean {
  const message = collectErrorText(err);
  if (!mentionsExtendedOrgColumn(message)) return false;

  return (
    message.includes("does not exist") ||
    message.includes("Failed query") ||
    message.includes("undefined column")
  );
}
