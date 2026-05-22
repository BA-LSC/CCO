ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_preset" text DEFAULT 'active' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_message" text;
