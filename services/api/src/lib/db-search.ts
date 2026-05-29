import { or, sql, type Column, type SQL } from "drizzle-orm";

export function escapeLikePattern(raw: string): string {
  return `%${raw.replace(/[%_\\]/g, "")}%`;
}

/** Case-insensitive name/email match for Postgres and D1 (SQLite has no ILIKE). */
export function matchDisplayNameOrEmail(
  displayNameColumn: Column,
  emailColumn: Column,
  rawQuery: string,
): SQL {
  const pattern = escapeLikePattern(rawQuery).toLowerCase();
  return or(
    sql`lower(${displayNameColumn}) like ${pattern}`,
    sql`lower(${emailColumn}) like ${pattern}`,
  )!;
}
