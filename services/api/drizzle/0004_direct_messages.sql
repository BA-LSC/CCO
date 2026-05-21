-- Direct message conversations (no group or service team parent).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "dm_pair_key" text;

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_parent_check";
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_parent_check"
  CHECK (
    ("group_id" IS NOT NULL AND "service_team_id" IS NULL AND "dm_pair_key" IS NULL)
    OR ("group_id" IS NULL AND "service_team_id" IS NOT NULL AND "dm_pair_key" IS NULL)
    OR ("group_id" IS NULL AND "service_team_id" IS NULL AND "dm_pair_key" IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_dm_pair_key"
  ON "conversations" ("dm_pair_key")
  WHERE "dm_pair_key" IS NOT NULL;
