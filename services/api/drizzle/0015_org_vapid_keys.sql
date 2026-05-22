ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vapid_public_key" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vapid_private_key_enc" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vapid_subject" text;
