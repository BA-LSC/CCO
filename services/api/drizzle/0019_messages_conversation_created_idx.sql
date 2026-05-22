CREATE INDEX IF NOT EXISTS "messages_conversation_created_active_idx"
  ON "messages" ("conversation_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;
