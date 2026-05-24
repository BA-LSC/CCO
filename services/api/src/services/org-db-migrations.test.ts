import { describe, expect, test } from "bun:test";
import { isMissingOrgMigrationColumnsError } from "./org-db-migrations";

describe("isMissingOrgMigrationColumnsError", () => {
  test("detects postgres column missing message", () => {
    const err = new Error('column "cloudflare_account_id" of relation "organizations" does not exist');
    expect(isMissingOrgMigrationColumnsError(err)).toBe(true);
  });

  test("detects drizzle Failed query wrapper", () => {
    const err = new Error(
      'Failed query: select "cloudflare_account_id", "realtime_kit_app_id" from "organizations" limit $1',
    );
    expect(isMissingOrgMigrationColumnsError(err)).toBe(true);
  });

  test("ignores unrelated query failures", () => {
    const err = new Error('Failed query: select "id" from "users" limit $1');
    expect(isMissingOrgMigrationColumnsError(err)).toBe(false);
  });
});
