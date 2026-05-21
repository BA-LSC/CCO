ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pco_web_redirect_uri text,
  ADD COLUMN IF NOT EXISTS pco_webhook_url text;
