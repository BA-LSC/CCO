import { cfRequest, CloudflareApiError } from "./cloudflare-api";

export type D1Database = {
  uuid: string;
  name: string;
};

export async function listD1Databases(
  accountId: string,
  apiToken: string,
): Promise<D1Database[]> {
  const result = await cfRequest<D1Database[]>(apiToken, `/accounts/${accountId}/d1/database`);
  return result ?? [];
}

export async function createD1Database(
  accountId: string,
  apiToken: string,
  name: string,
): Promise<D1Database> {
  return cfRequest<D1Database>(apiToken, `/accounts/${accountId}/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function ensureD1Database(
  accountId: string,
  apiToken: string,
  name: string,
): Promise<{ uuid: string; created: boolean }> {
  const existing = await listD1Databases(accountId, apiToken);
  const match = existing.find((db) => db.name === name);
  if (match) {
    return { uuid: match.uuid, created: false };
  }
  const created = await createD1Database(accountId, apiToken, name);
  return { uuid: created.uuid, created: true };
}

export async function executeD1Query(
  accountId: string,
  apiToken: string,
  databaseId: string,
  sql: string,
): Promise<void> {
  await queryD1(accountId, apiToken, databaseId, sql);
}

export type D1QueryResult = {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
  error?: string;
};

export async function queryD1(
  accountId: string,
  apiToken: string,
  databaseId: string,
  sql: string,
): Promise<D1QueryResult[]> {
  const result = await cfRequest<D1QueryResult[]>(
    apiToken,
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({ sql }),
    },
  );
  const rows = result ?? [];
  const failed = rows.find((row) => row.success === false || row.error);
  if (failed?.error) {
    throw new CloudflareApiError(`D1 query failed: ${failed.error}`);
  }
  return rows;
}

async function listD1TableColumns(
  accountId: string,
  apiToken: string,
  databaseId: string,
  table: string,
): Promise<Set<string>> {
  const batches = await queryD1(
    accountId,
    apiToken,
    databaseId,
    `PRAGMA table_info("${table.replace(/"/g, '""')}")`,
  );
  const columns = new Set<string>();
  for (const batch of batches) {
    for (const row of batch.results ?? []) {
      const name = row.name;
      if (typeof name === "string") columns.add(name);
    }
  }
  return columns;
}

async function readSqlFile(path: string): Promise<string> {
  const bun = (globalThis as { Bun?: { file: (p: string) => { text: () => Promise<string> } } }).Bun;
  if (bun) {
    return bun.file(path).text();
  }
  throw new CloudflareApiError(
    `Cannot read SQL file ${path}: filesystem access requires Bun runtime`,
  );
}

/** Apply migration SQL files sequentially via the D1 query API. */
export async function applyD1Migrations(
  accountId: string,
  apiToken: string,
  databaseId: string,
  sqlFiles: string[],
): Promise<void> {
  for (const file of sqlFiles) {
    const sql = (await readSqlFile(file)).trim();
    if (!sql) continue;
    await executeD1Query(accountId, apiToken, databaseId, sql);
  }
}

/** Apply raw SQL statements (for Workers runtime without filesystem access). */
export async function applyD1MigrationStatements(
  accountId: string,
  apiToken: string,
  databaseId: string,
  statements: string[],
): Promise<void> {
  for (const sql of statements) {
    const trimmed = sql.trim();
    if (!trimmed) continue;
    await executeD1Query(accountId, apiToken, databaseId, trimmed);
  }
}
