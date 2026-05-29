import { sql } from "drizzle-orm";
import { db } from "../db";
import { getWorkerBindings, getWorkerD1, isCloudflareRuntime } from "../runtime/worker-context";

const ORG_COLUMN_STATEMENTS = [
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_account_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_app_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_api_token_enc" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_bucket_name" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_access_key_id_enc" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_secret_access_key_enc" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_public_url" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_hyperdrive_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_kv_presence_namespace_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_kv_deploy_namespace_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_push_queue_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_platform_provisioned_at" timestamp`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_host" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_member" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_guest" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_last_synced_at" timestamp`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_nightly_sync_enabled" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "installed_release_version" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "auto_update_enabled" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "auto_update_check_interval_minutes" integer NOT NULL DEFAULT 360`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "last_update_check_at" timestamp`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "git_repo_url" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_secrets_store_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_client_secret_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_webhook_secrets_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "giphy_api_key_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vapid_private_key_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_api_token_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_access_key_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_secret_access_key_configured" boolean`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_worker_placement_mode" text NOT NULL DEFAULT 'smart'`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_worker_placement_region" text`,
] as const;

/**
 * D1 org columns added after the initial table (baseline includes all of these for greenfield).
 * Each is applied only when PRAGMA table_info shows it is missing.
 */
const D1_ORG_COLUMNS_TO_ENSURE: readonly { name: string; ddl: string }[] = [
  { name: "pco_client_id", ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_client_id" TEXT` },
  { name: "pco_client_secret_enc", ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_client_secret_enc" TEXT` },
  { name: "pco_webhook_secret_enc", ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_webhook_secret_enc" TEXT` },
  { name: "pco_web_redirect_uri", ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_web_redirect_uri" TEXT` },
  { name: "pco_webhook_url", ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_webhook_url" TEXT` },
  {
    name: "pco_oauth_scope",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_oauth_scope" TEXT NOT NULL DEFAULT 'people groups services'`,
  },
  { name: "setup_completed_at", ddl: `ALTER TABLE "organizations" ADD COLUMN "setup_completed_at" INTEGER` },
  { name: "setup_by_user_id", ddl: `ALTER TABLE "organizations" ADD COLUMN "setup_by_user_id" TEXT` },
  {
    name: "setup_session_token_hash",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "setup_session_token_hash" TEXT`,
  },
  { name: "vapid_public_key", ddl: `ALTER TABLE "organizations" ADD COLUMN "vapid_public_key" TEXT` },
  { name: "vapid_private_key_enc", ddl: `ALTER TABLE "organizations" ADD COLUMN "vapid_private_key_enc" TEXT` },
  { name: "vapid_subject", ddl: `ALTER TABLE "organizations" ADD COLUMN "vapid_subject" TEXT` },
  { name: "giphy_api_key_enc", ddl: `ALTER TABLE "organizations" ADD COLUMN "giphy_api_key_enc" TEXT` },
  { name: "cloudflare_account_id", ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_account_id" TEXT` },
  { name: "realtime_kit_app_id", ddl: `ALTER TABLE "organizations" ADD COLUMN "realtime_kit_app_id" TEXT` },
  {
    name: "cloudflare_api_token_enc",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_api_token_enc" TEXT`,
  },
  {
    name: "cloudflare_r2_bucket_name",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_bucket_name" TEXT`,
  },
  {
    name: "cloudflare_r2_access_key_id_enc",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_access_key_id_enc" TEXT`,
  },
  {
    name: "cloudflare_r2_secret_access_key_enc",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_secret_access_key_enc" TEXT`,
  },
  { name: "cloudflare_r2_public_url", ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_public_url" TEXT` },
  {
    name: "cloudflare_hyperdrive_id",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_hyperdrive_id" TEXT`,
  },
  {
    name: "cloudflare_kv_presence_namespace_id",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_kv_presence_namespace_id" TEXT`,
  },
  {
    name: "cloudflare_kv_deploy_namespace_id",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_kv_deploy_namespace_id" TEXT`,
  },
  { name: "cloudflare_push_queue_id", ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_push_queue_id" TEXT` },
  {
    name: "cloudflare_secrets_store_id",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_secrets_store_id" TEXT`,
  },
  {
    name: "pco_client_secret_configured",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_client_secret_configured" INTEGER`,
  },
  {
    name: "pco_webhook_secrets_configured",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_webhook_secrets_configured" INTEGER`,
  },
  { name: "giphy_api_key_configured", ddl: `ALTER TABLE "organizations" ADD COLUMN "giphy_api_key_configured" INTEGER` },
  {
    name: "vapid_private_key_configured",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "vapid_private_key_configured" INTEGER`,
  },
  {
    name: "cloudflare_api_token_configured",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_api_token_configured" INTEGER`,
  },
  {
    name: "cloudflare_r2_access_key_configured",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_access_key_configured" INTEGER`,
  },
  {
    name: "cloudflare_r2_secret_access_key_configured",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_secret_access_key_configured" INTEGER`,
  },
  {
    name: "cloudflare_platform_provisioned_at",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_platform_provisioned_at" INTEGER`,
  },
  { name: "realtime_kit_preset_host", ddl: `ALTER TABLE "organizations" ADD COLUMN "realtime_kit_preset_host" TEXT` },
  { name: "realtime_kit_preset_member", ddl: `ALTER TABLE "organizations" ADD COLUMN "realtime_kit_preset_member" TEXT` },
  { name: "realtime_kit_preset_guest", ddl: `ALTER TABLE "organizations" ADD COLUMN "realtime_kit_preset_guest" TEXT` },
  { name: "pco_last_synced_at", ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_last_synced_at" INTEGER` },
  {
    name: "pco_nightly_sync_enabled",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "pco_nightly_sync_enabled" INTEGER NOT NULL DEFAULT 1`,
  },
  { name: "installed_release_version", ddl: `ALTER TABLE "organizations" ADD COLUMN "installed_release_version" TEXT` },
  {
    name: "auto_update_enabled",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "auto_update_enabled" INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: "auto_update_check_interval_minutes",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "auto_update_check_interval_minutes" INTEGER NOT NULL DEFAULT 360`,
  },
  {
    name: "cloudflare_worker_placement_mode",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_worker_placement_mode" TEXT NOT NULL DEFAULT 'smart'`,
  },
  {
    name: "cloudflare_worker_placement_region",
    ddl: `ALTER TABLE "organizations" ADD COLUMN "cloudflare_worker_placement_region" TEXT`,
  },
  { name: "last_update_check_at", ddl: `ALTER TABLE "organizations" ADD COLUMN "last_update_check_at" INTEGER` },
  { name: "git_repo_url", ddl: `ALTER TABLE "organizations" ADD COLUMN "git_repo_url" TEXT` },
];

const D1_CONVERSATION_COLUMN_STATEMENTS = [
  `ALTER TABLE "conversations" ADD COLUMN "image_url" TEXT`,
] as const;

function ddlErrorDetail(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? err.cause.message : "";
    return cause ? `${err.message} ${cause}` : err.message;
  }
  return String(err);
}

function isBenignD1OrgColumnDdlError(err: unknown): boolean {
  return /duplicate column name|already exists/i.test(ddlErrorDetail(err));
}

/** Call tables from 0021 — optional; must not block Cloudflare token save. */
const CALL_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "call_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
    "host_user_id" uuid NOT NULL REFERENCES "users"("id"),
    "realtime_kit_meeting_id" text NOT NULL,
    "status" text NOT NULL DEFAULT 'ringing',
    "started_at" timestamp DEFAULT now() NOT NULL,
    "ended_at" timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS "call_sessions_conversation_id_idx" ON "call_sessions" ("conversation_id")`,
  `CREATE INDEX IF NOT EXISTS "call_sessions_realtime_kit_meeting_id_idx" ON "call_sessions" ("realtime_kit_meeting_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "call_sessions_active_conversation_unique"
    ON "call_sessions" ("conversation_id")
    WHERE "status" IN ('ringing', 'active')`,
  `CREATE TABLE IF NOT EXISTS "call_participants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "call_session_id" uuid NOT NULL REFERENCES "call_sessions"("id") ON DELETE CASCADE,
    "user_id" uuid REFERENCES "users"("id"),
    "guest_label" text,
    "realtime_kit_participant_id" text,
    "role" text NOT NULL DEFAULT 'member',
    "invited_at" timestamp DEFAULT now() NOT NULL,
    "joined_at" timestamp,
    "left_at" timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS "call_participants_call_session_id_idx" ON "call_participants" ("call_session_id")`,
  `CREATE INDEX IF NOT EXISTS "call_participants_user_id_idx" ON "call_participants" ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "call_invite_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "call_session_id" uuid NOT NULL REFERENCES "call_sessions"("id") ON DELETE CASCADE,
    "token_hash" text NOT NULL UNIQUE,
    "kind" text NOT NULL,
    "target_user_id" uuid REFERENCES "users"("id"),
    "target_email" text,
    "target_display_name" text,
    "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
    "expires_at" timestamp NOT NULL,
    "revoked_at" timestamp,
    "max_uses" integer NOT NULL DEFAULT 1,
    "use_count" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "call_invite_tokens_call_session_id_idx" ON "call_invite_tokens" ("call_session_id")`,
] as const;

let orgColumnsPromise: Promise<void> | null = null;
let orgColumnsReady = false;

let callSchemaPromise: Promise<void> | null = null;
let callSchemaReady = false;

async function executeDdl(statement: string): Promise<void> {
  const bindings = getWorkerBindings();
  if (bindings?.DB) {
    await bindings.DB.prepare(statement).run();
    return;
  }
  const d1 = getWorkerD1();
  if (d1) {
    await d1.run(sql.raw(statement));
    return;
  }
  await db.execute(sql.raw(statement));
}

async function d1OrganizationsHasColumn(columnName: string): Promise<boolean> {
  const d1 = getWorkerD1();
  if (!d1) return false;
  const rows = await d1.all<{ name: string }>(sql.raw(`PRAGMA table_info("organizations")`));
  return rows.some((row) => row.name === columnName);
}

async function executeOptionalDdl(statement: string): Promise<void> {
  try {
    await executeDdl(statement);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[schema ensure] optional call DDL skipped:", detail);
  }
}

async function runEnsureCloudflareOrganizationColumns(): Promise<void> {
  for (const statement of ORG_COLUMN_STATEMENTS) {
    await executeDdl(statement);
  }
  orgColumnsReady = true;
}

export async function callParticipantsTableExists(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'call_participants'
      AND column_name = 'realtime_kit_participant_id'
    LIMIT 1
  `);
  return result.length > 0;
}

async function runEnsureCallSessionSchema(): Promise<void> {
  for (const statement of CALL_SCHEMA_STATEMENTS) {
    await executeOptionalDdl(statement);
  }
  if (await callParticipantsTableExists()) {
    callSchemaReady = true;
  } else {
    callSchemaPromise = null;
    console.warn(
      "[schema ensure] call_participants table missing — apply latest release (Admin → Updates) or re-run D1 migrations",
    );
  }
}

async function runEnsureD1OrganizationColumns(): Promise<void> {
  for (const { name, ddl } of D1_ORG_COLUMNS_TO_ENSURE) {
    if (await d1OrganizationsHasColumn(name)) continue;
    try {
      await executeDdl(ddl);
    } catch (err) {
      if (!isBenignD1OrgColumnDdlError(err)) {
        throw err;
      }
    }
  }
}

async function runEnsureD1ConversationColumns(): Promise<void> {
  if (!(await d1ConversationsHasColumn("image_url"))) {
    for (const statement of D1_CONVERSATION_COLUMN_STATEMENTS) {
      try {
        await executeDdl(statement);
      } catch (err) {
        if (!isBenignD1OrgColumnDdlError(err)) {
          throw err;
        }
      }
    }
  }
}

async function d1ConversationsHasColumn(columnName: string): Promise<boolean> {
  const d1 = getWorkerD1();
  if (!d1) return true;
  const rows = await d1.all<{ name: string }>(sql.raw(`PRAGMA table_info("conversations")`));
  return rows.some((row) => row.name === columnName);
}

export async function ensureConversationSchemaBestEffort(): Promise<void> {
  if (!isCloudflareRuntime()) return;
  try {
    await runEnsureD1ConversationColumns();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[schema ensure] conversation columns skipped:", detail);
  }
}

/** Ensure organizations table matches Drizzle before inserts (first login, setup draft). */
export async function ensureOrganizationSchemaForWrite(): Promise<void> {
  await ensureCloudflareOrganizationColumns();
}

/** Best-effort ensure for read paths; logs and continues when DDL fails. */
export async function ensureCloudflareOrganizationColumnsBestEffort(): Promise<void> {
  try {
    await ensureCloudflareOrganizationColumns();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[schema ensure] cloudflare org columns skipped:", detail);
  }
}

/** Org columns for Cloudflare / RealtimeKit / platform settings (required, small, safe). */
export async function ensureCloudflareOrganizationColumns(): Promise<void> {
  if (isCloudflareRuntime()) {
    if (orgColumnsReady) return;
    if (!orgColumnsPromise) {
      orgColumnsPromise = runEnsureD1OrganizationColumns()
        .then(() => {
          orgColumnsReady = true;
        })
        .catch((err) => {
          orgColumnsPromise = null;
          throw err;
        });
    }
    await orgColumnsPromise;
    return;
  }
  if (orgColumnsReady) return;
  if (!orgColumnsPromise) {
    orgColumnsPromise = runEnsureCloudflareOrganizationColumns().catch((err) => {
      orgColumnsPromise = null;
      throw err;
    });
  }
  await orgColumnsPromise;
}

/** @deprecated Alias — includes R2, KV, Queues, Hyperdrive columns. */
export async function ensureCloudflarePlatformColumns(): Promise<void> {
  await ensureCloudflareOrganizationColumns();
}

/** Call session tables (best-effort; logged and skipped on failure). */
export async function ensureCallSessionSchema(): Promise<void> {
  if (isCloudflareRuntime()) {
    callSchemaReady = true;
    return;
  }
  if (callSchemaReady) return;
  if (!callSchemaPromise) {
    callSchemaPromise = runEnsureCallSessionSchema().catch((err) => {
      callSchemaPromise = null;
      console.warn("[schema ensure] call schema ensure failed:", err);
    });
  }
  await callSchemaPromise;
}

/** Org columns plus call tables. Cloudflare paths should use ensureCloudflareOrganizationColumns only. */
export async function ensureExtendedOrganizationSchema(): Promise<void> {
  await ensureCloudflareOrganizationColumns();
  await ensureCallSessionSchema();
}

/** @deprecated Use ensureCloudflareOrganizationColumns. */
export async function hasExtendedOrganizationColumns(): Promise<boolean> {
  await ensureCloudflareOrganizationColumns();
  return true;
}

export function resetExtendedOrganizationColumnsCache(): void {
  orgColumnsReady = false;
  orgColumnsPromise = null;
  callSchemaReady = false;
  callSchemaPromise = null;
}
