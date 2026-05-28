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

  test("getD1IncrementalMigrationFilenames is empty (baseline-only schema)", () => {
    expect(getD1IncrementalMigrationFilenames()).toEqual([]);
  });
});

describe("D1 org-schema no-ops", () => {
  test("ensure helpers resolve without error", async () => {
    await ensureCloudflareOrganizationColumns();
    await ensureCallSessionSchema();
    expect(await callParticipantsTableExists()).toBe(true);
  });
});
