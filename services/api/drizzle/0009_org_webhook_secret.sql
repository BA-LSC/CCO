ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pco_webhook_secret_enc text;
