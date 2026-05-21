CREATE TABLE IF NOT EXISTS "user_pco_credentials" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "expires_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
