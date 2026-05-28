ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_worker_placement_mode" text NOT NULL DEFAULT 'smart';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_worker_placement_region" text;
