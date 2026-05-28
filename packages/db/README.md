# @cco/db — D1 schema for Cloudflare-native deploy

**D1/SQLite** schema and migrations for Workers (`workers/cco-api`). Postgres schema for legacy VPS lives on the **`manual-vps`** branch (`services/api/src/db/schema.ts`).

## Conventions

| Legacy Postgres | D1 (this package) |
|-----------------|-------------------|
| `uuid` | `text` with `crypto.randomUUID()` default |
| `timestamp` | `integer` `{ mode: "timestamp_ms" }` |
| `boolean` | `integer` `{ mode: "boolean" }` |
| `gen_random_uuid()` | app-generated UUID strings |
| `now()` | `new Date()` / `unixepoch('subsec') * 1000` in SQL |

## Migrations

Greenfield D1 installs use a single baseline: `drizzle/d1/0000_d1_baseline.sql` (consolidates Postgres migrations 0000–0023). No Postgres→D1 data migration in v1.

- **Workers:** `runMigrations(createD1Client(env.DB))` via Drizzle migrator
- **Provision pipeline:** `getD1MigrationSqlFiles()` → `@cco/cloudflare-provision` `applyD1Migrations`
- **Workers (no FS):** `applyBaselineMigration(env.DB)` after bundling SQL or use migrator with copied folder

## D1-specific query modules

Raw SQL that differs between Postgres and SQLite is **not** shared in `services/api` for production paths. Use these modules from the Cloudflare API worker:

| Legacy Postgres (`manual-vps`) | D1 (`@cco/db`) | Difference |
|--------------------------------|----------------|------------|
| `services/unread.ts` → `fetchLastMessagesForConversations` | `@cco/db/queries/unread` → `fetchLastMessagesForConversationsD1` | `DISTINCT ON` → `ROW_NUMBER()` window; no `::uuid` cast |
| `services/org-schema-capabilities.ts` | `@cco/db/queries/org-schema` | Runtime DDL no-ops; baseline has all columns |
| `services/dms.ts` | Drizzle ORM only | `sql\`… IS NOT NULL\`` works on both |
| `services/calls.ts` | Drizzle ORM only | `sql\`… IS NOT NULL\`` works on both |

## Usage

```typescript
import { createD1Client, runMigrations } from "@cco/db";

const db = createD1Client(env.DB);
await runMigrations(db);
```
