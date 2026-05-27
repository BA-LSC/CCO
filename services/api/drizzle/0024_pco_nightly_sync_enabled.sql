ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_nightly_sync_enabled" boolean NOT NULL DEFAULT true;
