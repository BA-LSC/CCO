import { describe, expect, test } from "bun:test";

/** Mirrors isBenignD1OrgColumnDdlError in org-schema-capabilities.ts */
function isBenignD1OrgColumnDdlError(err: unknown): boolean {
  const detail =
    err instanceof Error
      ? err.cause instanceof Error
        ? `${err.message} ${err.cause.message}`
        : err.message
      : String(err);
  return /duplicate column name|already exists/i.test(detail);
}

describe("D1 org placement DDL errors", () => {
  test("treats duplicate column in DrizzleQueryError cause as benign", () => {
    const err = new Error(
      'Failed query: ALTER TABLE "organizations" ADD COLUMN "cloudflare_worker_placement_mode" TEXT DEFAULT \'smart\'\nparams: ',
    );
    err.cause = new Error("duplicate column name: cloudflare_worker_placement_mode");
    expect(isBenignD1OrgColumnDdlError(err)).toBe(true);
  });

  test("treats SQLITE already exists wording as benign", () => {
    const err = new Error("D1_ERROR: column cloudflare_worker_placement_mode already exists");
    expect(isBenignD1OrgColumnDdlError(err)).toBe(true);
  });

  test("does not treat unrelated DDL failures as benign", () => {
    const err = new Error('Failed query: ALTER TABLE "organizations" ADD COLUMN "x" TEXT\nparams: ');
    err.cause = new Error("no such table: organizations");
    expect(isBenignD1OrgColumnDdlError(err)).toBe(false);
  });
});
