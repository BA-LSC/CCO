export const ORG_MIGRATIONS_0021_0023_MESSAGE =
  "Database is missing recent migrations. Apply the latest release from Admin → Updates, or re-run install D1 migrations.";

const EXTENDED_ORG_COLUMN_MARKERS = [
  "cloudflare_account_id",
  "cloudflare_api_token_enc",
  "cloudflare_secrets_store_id",
  "realtime_kit_",
  "pco_last_synced_at",
  "pco_nightly_sync_enabled",
  "git_repo_url",
  "last_update_check_at",
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

const CALL_SCHEMA_MARKERS = [
  "call_participants",
  "call_sessions",
  "call_invite_tokens",
] as const;

function mentionsCallSchema(message: string): boolean {
  return CALL_SCHEMA_MARKERS.some((marker) => message.includes(marker));
}

function hasSchemaMissingSignal(message: string): boolean {
  if (/does not exist/i.test(message)) return true;
  if (/undefined column/i.test(message)) return true;
  if (/no such column/i.test(message)) return true;
  if (/has no column named/i.test(message)) return true;
  if (/Failed query/i.test(message) && /no such column/i.test(message)) return true;
  if (/Failed query/i.test(message) && /does not exist/i.test(message)) return true;
  return false;
}

export function isMissingOrgMigrationColumnsError(err: unknown): boolean {
  const message = collectErrorText(err);
  if (!hasSchemaMissingSignal(message)) return false;
  return mentionsExtendedOrgColumn(message) || mentionsCallSchema(message);
}
