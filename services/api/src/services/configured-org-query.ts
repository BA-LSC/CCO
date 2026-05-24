import type { SQL } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { ensureCloudflareOrganizationColumns } from "./org-schema-capabilities";
import {
  configuredOrganizationColumns,
  type ConfiguredOrganizationRow,
} from "./org-select";

export async function selectConfiguredOrganizationRow(
  where: SQL | undefined,
): Promise<ConfiguredOrganizationRow | null> {
  await ensureCloudflareOrganizationColumns();

  const rows = await db
    .select(configuredOrganizationColumns)
    .from(organizations)
    .where(where)
    .limit(1);

  return rows[0] ?? null;
}
