import type { SQL } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { isMissingOrgMigrationColumnsError } from "./org-db-migrations";
import { hasExtendedOrganizationColumns } from "./org-schema-capabilities";
import {
  configuredOrganizationColumns,
  configuredOrganizationColumnsLegacy,
  extendConfiguredOrganizationRow,
  type ConfiguredOrganizationRow,
} from "./org-select";

async function selectOrganizationRow(
  columns: typeof configuredOrganizationColumns | typeof configuredOrganizationColumnsLegacy,
  where: SQL | undefined,
  extendLegacy: boolean,
): Promise<ConfiguredOrganizationRow | null> {
  const rows = await db.select(columns).from(organizations).where(where).limit(1);
  const row = rows[0];
  if (!row) return null;
  return extendLegacy
    ? extendConfiguredOrganizationRow(row)
    : (row as ConfiguredOrganizationRow);
}

export async function selectConfiguredOrganizationRow(
  where: SQL | undefined,
): Promise<ConfiguredOrganizationRow | null> {
  const extended = await hasExtendedOrganizationColumns();
  if (!extended) {
    return selectOrganizationRow(configuredOrganizationColumnsLegacy, where, true);
  }

  try {
    return await selectOrganizationRow(configuredOrganizationColumns, where, false);
  } catch (err) {
    if (!isMissingOrgMigrationColumnsError(err)) throw err;
    return selectOrganizationRow(configuredOrganizationColumnsLegacy, where, true);
  }
}
