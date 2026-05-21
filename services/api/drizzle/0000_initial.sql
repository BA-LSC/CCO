CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "pco_organization_id" text NOT NULL,
  "church_center_subdomain" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organizations_pco_organization_id_unique" UNIQUE("pco_organization_id")
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "pco_person_id" text NOT NULL,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_org_person" ON "users" ("organization_id","pco_person_id");

CREATE TABLE IF NOT EXISTS "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "pco_group_id" text NOT NULL,
  "name" text NOT NULL,
  "archived_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "groups_org_pco" ON "groups" ("organization_id","pco_group_id");

CREATE TABLE IF NOT EXISTS "group_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text DEFAULT 'member' NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "membership_group_user" ON "group_memberships" ("group_id","user_id");

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id"),
  "slug" text DEFAULT 'general' NOT NULL,
  "title" text NOT NULL,
  "leader_only" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_group_slug" ON "conversations" ("group_id","slug");

CREATE TABLE IF NOT EXISTS "conversation_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "muted" boolean DEFAULT false NOT NULL,
  "last_read_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_members_unique" ON "conversation_members" ("conversation_id","user_id");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "client_message_id" text NOT NULL,
  "edited_at" timestamp,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "messages_idempotent" ON "messages" ("conversation_id","client_message_id");

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "messages"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "emoji" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_unique" ON "message_reactions" ("message_id","user_id","emoji");
