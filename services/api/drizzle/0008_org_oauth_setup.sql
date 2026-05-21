ALTER TABLE "organizations" ADD COLUMN "pco_client_id" text;
ALTER TABLE "organizations" ADD COLUMN "pco_client_secret_enc" text;
ALTER TABLE "organizations" ADD COLUMN "pco_oauth_scope" text DEFAULT 'people groups services' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN "setup_completed_at" timestamp;
ALTER TABLE "organizations" ADD COLUMN "setup_by_user_id" uuid REFERENCES "users"("id");

ALTER TABLE "users" ADD COLUMN "site_administrator" boolean DEFAULT false NOT NULL;
