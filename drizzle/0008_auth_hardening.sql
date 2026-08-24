CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  blocked_until text,
  updated_at text NOT NULL,
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_blocked ON auth_rate_limits (blocked_until);
