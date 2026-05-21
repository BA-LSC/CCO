CREATE TABLE IF NOT EXISTS mobile_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  session_token text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_auth_codes_expires_at ON mobile_auth_codes (expires_at);
