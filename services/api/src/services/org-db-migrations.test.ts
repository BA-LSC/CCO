import { describe, expect, test } from "bun:test";
import { isMissingOrgMigrationColumnsError } from "./org-db-migrations";

describe("isMissingOrgMigrationColumnsError", () => {
  test("detects postgres column missing message", () => {
    const err = new Error('column "cloudflare_account_id" of relation "organizations" does not exist');
    expect(isMissingOrgMigrationColumnsError(err)).toBe(true);
  });

  test("detects drizzle wrapper when cause mentions missing column", () => {
    const err = new Error(
      'Failed query: select "cloudflare_account_id", "realtime_kit_app_id" from "organizations" limit $1',
    );
    err.cause = new Error('column "cloudflare_account_id" of relation "organizations" does not exist');
    expect(isMissingOrgMigrationColumnsError(err)).toBe(true);
  });

  test("detects missing call_participants relation", () => {
    const err = new Error('relation "call_participants" does not exist');
    expect(isMissingOrgMigrationColumnsError(err)).toBe(true);
  });

  test("detects sqlite insert missing column", () => {
    const err = new Error(
      'Failed query: insert into "organizations" ("cloudflare_secrets_store_id") values (?)',
    );
    err.cause = new Error("D1_ERROR: table organizations has no column named cloudflare_secrets_store_id");
    expect(isMissingOrgMigrationColumnsError(err)).toBe(true);
  });

  test("ignores unrelated query failures", () => {
    const err = new Error('Failed query: select "id" from "users" limit $1');
    expect(isMissingOrgMigrationColumnsError(err)).toBe(false);
  });

  test("ignores call query failures without schema-missing cause", () => {
    const err = new Error(
      'Failed query: select "id", "realtime_kit_participant_id" from "call_participants" where ("call_participants"."call_session_id" = $1 and "call_participants"."user_id" = $2 and "call_participants"."left_at" is null) limit $3',
    );
    err.cause = new Error("connection timeout");
    expect(isMissingOrgMigrationColumnsError(err)).toBe(false);
  });
});
