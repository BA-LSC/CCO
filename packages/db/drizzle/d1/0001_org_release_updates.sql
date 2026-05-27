-- Org release/update settings for Admin Updates (BYO Cloudflare day-two).
ALTER TABLE "organizations" ADD COLUMN "installed_release_version" TEXT;
ALTER TABLE "organizations" ADD COLUMN "auto_update_enabled" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN "last_update_check_at" INTEGER;
