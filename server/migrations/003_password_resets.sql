-- Password reset and session clean-up (CC-201).
-- Reset tokens are stored only as a SHA-256 hash, work once and expire after
-- 30 minutes. Expired sessions, used or expired reset tokens and old
-- rate-limit buckets are deleted by the cleanup job (server/cleanup.ts).

CREATE TABLE password_resets (
  token_hash  text PRIMARY KEY,                 -- SHA-256 of the emailed token; the token itself is never stored
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX password_resets_user_idx ON password_resets(user_id);
CREATE INDEX password_resets_expires_idx ON password_resets(expires_at);

CREATE INDEX sessions_expires_idx ON sessions(expires_at);
CREATE INDEX sessions_last_seen_idx ON sessions(last_seen_at);
