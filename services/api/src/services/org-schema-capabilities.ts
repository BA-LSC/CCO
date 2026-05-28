import { sql } from "drizzle-orm";
import { db } from "../db";
import { isCloudflareRuntime } from "../runtime/worker-context";

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

/** SQLite D1 org columns not yet on older installs (baseline adds them for greenfield). */
const D1_ORG_COLUMN_STATEMENTS = [
  `ALTER TABLE "organizations" ADD COLUMN "cloudflare_worker_placement_mode" TEXT NOT NULL DEFAULT 'smart'`,
  `ALTER TABLE "organizations" ADD COLUMN "cloudflare_worker_placement_region" TEXT`,
] as const;

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
  await db.execute(sql.raw(statement));
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
  for (const statement of D1_ORG_COLUMN_STATEMENTS) {
    try {
      await executeDdl(statement);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (!/duplicate column name/i.test(detail)) {
        throw err;
      }
    }
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
