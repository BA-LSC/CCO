-- D1 baseline: greenfield schema consolidating Postgres migrations 0000–0024.
-- Timestamps are INTEGER milliseconds since epoch. IDs are TEXT (UUID strings).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "pco_organization_id" TEXT NOT NULL,
  "church_center_subdomain" TEXT,
  "pco_client_id" TEXT,
  "pco_client_secret_enc" TEXT,
  "pco_webhook_secret_enc" TEXT,
  "pco_web_redirect_uri" TEXT,
  "pco_webhook_url" TEXT,
  "pco_oauth_scope" TEXT NOT NULL DEFAULT 'people groups services',
  "setup_completed_at" INTEGER,
  "setup_by_user_id" TEXT,
  "setup_session_token_hash" TEXT,
  "vapid_public_key" TEXT,
  "vapid_private_key_enc" TEXT,
  "vapid_subject" TEXT,
  "giphy_api_key_enc" TEXT,
  "cloudflare_account_id" TEXT,
  "realtime_kit_app_id" TEXT,
  "cloudflare_api_token_enc" TEXT,
  "cloudflare_r2_bucket_name" TEXT,
  "cloudflare_r2_access_key_id_enc" TEXT,
  "cloudflare_r2_secret_access_key_enc" TEXT,
  "cloudflare_r2_public_url" TEXT,
  "cloudflare_hyperdrive_id" TEXT,
  "cloudflare_kv_presence_namespace_id" TEXT,
  "cloudflare_kv_deploy_namespace_id" TEXT,
  "cloudflare_push_queue_id" TEXT,
  "cloudflare_secrets_store_id" TEXT,
  "pco_client_secret_configured" INTEGER,
  "pco_webhook_secrets_configured" INTEGER,
  "giphy_api_key_configured" INTEGER,
  "vapid_private_key_configured" INTEGER,
  "cloudflare_api_token_configured" INTEGER,
  "cloudflare_r2_access_key_configured" INTEGER,
  "cloudflare_r2_secret_access_key_configured" INTEGER,
  "git_repo_url" TEXT,
  "auto_update_check_interval_minutes" INTEGER NOT NULL DEFAULT 360,
  "cloudflare_worker_placement_mode" TEXT NOT NULL DEFAULT 'smart',
  "cloudflare_worker_placement_region" TEXT,
  "cloudflare_platform_provisioned_at" INTEGER,
  "realtime_kit_preset_host" TEXT,
  "realtime_kit_preset_member" TEXT,
  "realtime_kit_preset_guest" TEXT,
  "pco_last_synced_at" INTEGER,
  "pco_nightly_sync_enabled" INTEGER NOT NULL DEFAULT 1,
  "installed_release_version" TEXT,
  "auto_update_enabled" INTEGER NOT NULL DEFAULT 0,
  "last_update_check_at" INTEGER,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER)),
  CONSTRAINT "organizations_pco_organization_id_unique" UNIQUE("pco_organization_id")
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id"),
  "pco_person_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "avatar_url" TEXT,
  "theme" TEXT NOT NULL DEFAULT '1',
  "site_administrator" INTEGER NOT NULL DEFAULT 0,
  "status_preset" TEXT NOT NULL DEFAULT 'active',
  "status_message" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_org_person" ON "users" ("organization_id", "pco_person_id");
CREATE INDEX IF NOT EXISTS "users_pco_person_id_idx" ON "users" ("pco_person_id");

CREATE TABLE IF NOT EXISTS "groups" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id"),
  "pco_group_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "image_url" TEXT,
  "archived_at" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS "groups_org_pco" ON "groups" ("organization_id", "pco_group_id");

CREATE TABLE IF NOT EXISTS "group_memberships" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "group_id" TEXT NOT NULL REFERENCES "groups"("id"),
  "user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "role" TEXT NOT NULL DEFAULT 'member',
  "synced_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "membership_group_user" ON "group_memberships" ("group_id", "user_id");
CREATE INDEX IF NOT EXISTS "group_memberships_user_id_idx" ON "group_memberships" ("user_id");

CREATE TABLE IF NOT EXISTS "mobile_auth_codes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "session_token" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "used_at" INTEGER,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS "mobile_auth_codes_expires_at" ON "mobile_auth_codes" ("expires_at");

CREATE TABLE IF NOT EXISTS "user_pco_credentials" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT,
  "expires_at" INTEGER,
  "updated_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "expo_push_token" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_user_token" ON "push_tokens" ("user_id", "expo_push_token");

CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "web_push_subscriptions_user_endpoint"
  ON "web_push_subscriptions" ("user_id", "endpoint");

CREATE TABLE IF NOT EXISTS "service_teams" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id"),
  "pco_team_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "service_type_names" TEXT,
  "synced_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_teams_org_pco" ON "service_teams" ("organization_id", "pco_team_id");

CREATE TABLE IF NOT EXISTS "service_team_memberships" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "team_id" TEXT NOT NULL REFERENCES "service_teams"("id"),
  "user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "role" TEXT NOT NULL DEFAULT 'member',
  "synced_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_team_membership_unique"
  ON "service_team_memberships" ("team_id", "user_id");

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "group_id" TEXT REFERENCES "groups"("id"),
  "service_team_id" TEXT REFERENCES "service_teams"("id"),
  "dm_pair_key" TEXT,
  "slug" TEXT NOT NULL DEFAULT 'general',
  "title" TEXT NOT NULL,
  "leader_only" INTEGER NOT NULL DEFAULT 0,
  "archived_at" INTEGER,
  CONSTRAINT "conversations_parent_check" CHECK (
    ("group_id" IS NOT NULL AND "service_team_id" IS NULL AND "dm_pair_key" IS NULL)
    OR ("group_id" IS NULL AND "service_team_id" IS NOT NULL AND "dm_pair_key" IS NULL)
    OR ("group_id" IS NULL AND "service_team_id" IS NULL AND "dm_pair_key" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_group_slug" ON "conversations" ("group_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_dm_pair_key" ON "conversations" ("dm_pair_key");
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_team_slug"
  ON "conversations" ("service_team_id", "slug")
  WHERE "service_team_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "conversations_group_id_active_idx"
  ON "conversations" ("group_id")
  WHERE "archived_at" IS NULL;

CREATE TABLE IF NOT EXISTS "conversation_members" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "conversation_id" TEXT NOT NULL REFERENCES "conversations"("id"),
  "user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "muted" INTEGER NOT NULL DEFAULT 0,
  "last_read_at" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_members_unique"
  ON "conversation_members" ("conversation_id", "user_id");
CREATE INDEX IF NOT EXISTS "conversation_members_user_id_idx" ON "conversation_members" ("user_id");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "conversation_id" TEXT NOT NULL REFERENCES "conversations"("id"),
  "author_id" TEXT NOT NULL REFERENCES "users"("id"),
  "body" TEXT NOT NULL DEFAULT '',
  "attachment_url" TEXT,
  "message_type" TEXT NOT NULL DEFAULT 'text',
  "client_message_id" TEXT NOT NULL,
  "edited_at" INTEGER,
  "deleted_at" INTEGER,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "messages_idempotent"
  ON "messages" ("conversation_id", "client_message_id");
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx"
  ON "messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_conversation_created_active_idx"
  ON "messages" ("conversation_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "processed_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_delivery_id"
  ON "webhook_deliveries" ("delivery_id");

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "message_id" TEXT NOT NULL REFERENCES "messages"("id"),
  "user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "emoji" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_unique"
  ON "message_reactions" ("message_id", "user_id", "emoji");

CREATE TABLE IF NOT EXISTS "call_sessions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "conversation_id" TEXT NOT NULL REFERENCES "conversations"("id"),
  "host_user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "realtime_kit_meeting_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ringing',
  "started_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER)),
  "ended_at" INTEGER
);

CREATE INDEX IF NOT EXISTS "call_sessions_conversation_id_idx" ON "call_sessions" ("conversation_id");
CREATE INDEX IF NOT EXISTS "call_sessions_realtime_kit_meeting_id_idx"
  ON "call_sessions" ("realtime_kit_meeting_id");
CREATE UNIQUE INDEX IF NOT EXISTS "call_sessions_active_conversation_unique"
  ON "call_sessions" ("conversation_id")
  WHERE "status" IN ('ringing', 'active');

CREATE TABLE IF NOT EXISTS "call_participants" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "call_session_id" TEXT NOT NULL REFERENCES "call_sessions"("id") ON DELETE CASCADE,
  "user_id" TEXT REFERENCES "users"("id"),
  "guest_label" TEXT,
  "realtime_kit_participant_id" TEXT,
  "role" TEXT NOT NULL DEFAULT 'member',
  "invited_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER)),
  "joined_at" INTEGER,
  "left_at" INTEGER
);

CREATE INDEX IF NOT EXISTS "call_participants_call_session_id_idx"
  ON "call_participants" ("call_session_id");
CREATE INDEX IF NOT EXISTS "call_participants_user_id_idx" ON "call_participants" ("user_id");

CREATE TABLE IF NOT EXISTS "call_invite_tokens" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "call_session_id" TEXT NOT NULL REFERENCES "call_sessions"("id") ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL,
  "target_user_id" TEXT REFERENCES "users"("id"),
  "target_email" TEXT,
  "target_display_name" TEXT,
  "created_by_user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "expires_at" INTEGER NOT NULL,
  "revoked_at" INTEGER,
  "max_uses" INTEGER NOT NULL DEFAULT 1,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT (cast(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS "call_invite_tokens_call_session_id_idx"
  ON "call_invite_tokens" ("call_session_id");
