import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  callParticipantsTableExists,
  ensureCloudflareOrganizationColumns,
  ensureCallSessionSchema,
} from "./queries/org-schema.d1.js";
import {
  getD1IncrementalMigrationFilenames,
  getD1MigrationSqlFiles,
  readD1BaselineSql,
} from "./client.js";

describe("D1 client helpers", () => {
  test("readD1BaselineSql returns non-empty SQL", async () => {
    const sql = await readD1BaselineSql();
    expect(sql.length).toBeGreaterThan(1000);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "organizations"');
    expect(sql).toContain("call_invite_tokens");
  });

  test("baseline SQL file matches readD1BaselineSql", async () => {
    const fromDisk = readFileSync(getD1MigrationSqlFiles()[0]!, "utf8");
    const fromHelper = await readD1BaselineSql();
    expect(fromHelper).toBe(fromDisk);
  });

  test("getD1IncrementalMigrationFilenames lists shipped day-two migrations", () => {
    const files = getD1IncrementalMigrationFilenames();
    expect(files).toEqual([
      "0001_org_release_updates.sql",
      "0002_pco_nightly_sync_enabled.sql",
      "0003_org_git_repo_url.sql",
      "0004_secrets_store.sql",
      "0005_auto_update_check_interval.sql",
    ]);
  });
});

describe("D1 org-schema no-ops", () => {
  test("ensure helpers resolve without error", async () => {
    await ensureCloudflareOrganizationColumns();
    await ensureCallSessionSchema();
    expect(await callParticipantsTableExists()).toBe(true);
  });
});
