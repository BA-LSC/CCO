import { sql } from "drizzle-orm";
import { db } from "../db";

/** Idempotent DDL for RealtimeKit / Cloudflare (0021–0023). Safe to run on every deploy. */
const ENSURE_EXTENDED_SCHEMA_STATEMENTS = [
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_account_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_app_id" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_api_token_enc" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_host" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_member" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "realtime_kit_preset_guest" text`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_last_synced_at" timestamp`,
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

let ensurePromise: Promise<void> | null = null;
let extendedSchemaReady = false;

async function runEnsureExtendedOrganizationSchema(): Promise<void> {
  for (const statement of ENSURE_EXTENDED_SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  extendedSchemaReady = true;
}

/** Create Cloudflare / RealtimeKit columns and call tables if missing. */
export async function ensureExtendedOrganizationSchema(): Promise<void> {
  if (extendedSchemaReady) return;
  if (!ensurePromise) {
    ensurePromise = runEnsureExtendedOrganizationSchema().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

/** @deprecated Use ensureExtendedOrganizationSchema — kept for callers that probed before ensure existed. */
export async function hasExtendedOrganizationColumns(): Promise<boolean> {
  await ensureExtendedOrganizationSchema();
  return true;
}

export function resetExtendedOrganizationColumnsCache(): void {
  extendedSchemaReady = false;
  ensurePromise = null;
}
