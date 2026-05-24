export const ORG_MIGRATIONS_0021_0023_MESSAGE =
  "Database is missing recent API migrations. Run migrations 0021–0023 (./deploy/compose.sh run --rm migrate), then try again.";

export function isMissingOrgMigrationColumnsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (!message.includes("does not exist")) return false;
  return (
    message.includes("cloudflare_account_id") ||
    message.includes("cloudflare_api_token_enc") ||
    message.includes("realtime_kit_") ||
    message.includes("pco_last_synced_at")
  );
}
