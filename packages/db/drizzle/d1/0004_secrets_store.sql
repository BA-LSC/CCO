ALTER TABLE "organizations" ADD COLUMN "cloudflare_secrets_store_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN "pco_client_secret_configured" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "pco_webhook_secrets_configured" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "giphy_api_key_configured" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "vapid_private_key_configured" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "cloudflare_api_token_configured" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_access_key_configured" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "cloudflare_r2_secret_access_key_configured" INTEGER;
