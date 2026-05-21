ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachment_url" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "message_type" text DEFAULT 'text' NOT NULL;

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "expo_push_token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_user_token" ON "push_tokens" ("user_id", "expo_push_token");

CREATE TABLE IF NOT EXISTS "service_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "pco_team_id" text NOT NULL,
  "name" text NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_teams_org_pco" ON "service_teams" ("organization_id", "pco_team_id");

CREATE TABLE IF NOT EXISTS "service_team_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "service_teams"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text DEFAULT 'member' NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_team_membership_unique" ON "service_team_memberships" ("team_id", "user_id");

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "service_team_id" uuid REFERENCES "service_teams"("id");
