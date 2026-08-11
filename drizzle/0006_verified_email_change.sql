CREATE TABLE IF NOT EXISTS email_change_codes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  new_email text NOT NULL,
  code_hash text NOT NULL,
  created_at text NOT NULL,
  expires_at text NOT NULL,
  consumed_at text,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS email_change_codes_user_created ON email_change_codes (user_id,created_at);
