import type { SQL } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { isMissingOrgMigrationColumnsError } from "./org-db-migrations";
import {
  configuredOrganizationColumns,
  configuredOrganizationColumnsLegacy,
  extendConfiguredOrganizationRow,
  type ConfiguredOrganizationRow,
} from "./org-select";

export async function selectConfiguredOrganizationRow(
  where: SQL | undefined,
): Promise<ConfiguredOrganizationRow | null> {
  try {
    const rows = await db
      .select(configuredOrganizationColumns)
      .from(organizations)
      .where(where)
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    if (!isMissingOrgMigrationColumnsError(err)) throw err;

    const rows = await db
      .select(configuredOrganizationColumnsLegacy)
      .from(organizations)
      .where(where)
      .limit(1);
    const row = rows[0];
    return row ? extendConfiguredOrganizationRow(row) : null;
  }
}
