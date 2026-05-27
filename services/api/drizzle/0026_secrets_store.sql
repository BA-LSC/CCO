ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_secrets_store_id" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_client_secret_configured" boolean;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pco_webhook_secrets_configured" boolean;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "giphy_api_key_configured" boolean;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vapid_private_key_configured" boolean;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_api_token_configured" boolean;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_access_key_configured" boolean;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cloudflare_r2_secret_access_key_configured" boolean;
