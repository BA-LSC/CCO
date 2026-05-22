CREATE INDEX IF NOT EXISTS "group_memberships_user_id_idx" ON "group_memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "conversation_members_user_id_idx" ON "conversation_members" ("user_id");
CREATE INDEX IF NOT EXISTS "conversations_group_id_active_idx"
  ON "conversations" ("group_id")
  WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "users_pco_person_id_idx" ON "users" ("pco_person_id");
