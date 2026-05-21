-- Conversations belong to either a group or a service team, not both.
ALTER TABLE "conversations" ALTER COLUMN "group_id" DROP NOT NULL;

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_parent_check";
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_parent_check"
  CHECK (
    ("group_id" IS NOT NULL AND "service_team_id" IS NULL)
    OR ("group_id" IS NULL AND "service_team_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_team_slug"
  ON "conversations" ("service_team_id", "slug")
  WHERE "service_team_id" IS NOT NULL;
