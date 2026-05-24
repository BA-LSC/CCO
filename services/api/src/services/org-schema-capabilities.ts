import { sql } from "drizzle-orm";
import { db } from "../db";

/** Cached result of whether migration 0021+ org columns exist. */
let extendedOrgColumns: boolean | null = null;

export async function hasExtendedOrganizationColumns(): Promise<boolean> {
  if (extendedOrgColumns !== null) return extendedOrgColumns;

  try {
    const rows = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'cloudflare_account_id'
      LIMIT 1
    `);
    extendedOrgColumns = rows.length > 0;
  } catch {
    extendedOrgColumns = false;
  }

  return extendedOrgColumns;
}

export function resetExtendedOrganizationColumnsCache(): void {
  extendedOrgColumns = null;
}
