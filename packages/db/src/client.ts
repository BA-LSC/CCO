import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { migrate } from "drizzle-orm/d1/migrator";
import * as schema from "./schema.d1.js";

export type CcoD1Database = DrizzleD1Database<typeof schema>;

/** Create a Drizzle client bound to a Cloudflare D1 database. */
export function createD1Client(database: D1Database): CcoD1Database {
  return drizzle(database, { schema });
}

/** Alias matching plan naming (`createDb(binding)`). */
export const createDb = createD1Client;

function getPackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

/** Absolute path to D1 migration SQL folder (for local Bun / provision pipeline). */
export function getD1MigrationsFolder(): string {
  return join(getPackageRoot(), "drizzle", "d1");
}

/** Paths to baseline migration SQL files in apply order. */
export function getD1MigrationSqlFiles(): string[] {
  return [join(getD1MigrationsFolder(), "0000_d1_baseline.sql")];
}

/** Incremental D1 migration filenames shipped in release artifacts (apply order). */
export function getD1IncrementalMigrationFilenames(): string[] {
  return [
    "0001_org_release_updates.sql",
    "0002_pco_nightly_sync_enabled.sql",
    "0003_org_git_repo_url.sql",
    "0004_secrets_store.sql",
    "0005_auto_update_check_interval.sql",
  ];
}

/** Read baseline migration SQL (for Workers without filesystem or provision API batch). */
export async function readD1BaselineSql(): Promise<string> {
  const bun = (globalThis as { Bun?: { file: (p: string) => { text: () => Promise<string> } } }).Bun;
  if (!bun) {
    throw new Error("readD1BaselineSql requires Bun runtime for filesystem access");
  }
  return bun.file(getD1MigrationSqlFiles()[0]!).text();
}

/**
 * Apply Drizzle migrations from `drizzle/d1` using the D1 migrator.
 * Use in Workers with a bundled migrations folder or locally via Bun.
 */
export async function runMigrations(db: CcoD1Database): Promise<void> {
  await migrate(db, { migrationsFolder: getD1MigrationsFolder() });
}

/**
 * Apply raw baseline SQL directly on a D1 binding (no filesystem).
 * Prefer `runMigrations` when the migrations folder is available.
 */
export async function applyBaselineMigration(database: D1Database): Promise<void> {
  const sql = await readD1BaselineSql();
  await database.exec(sql);
}
