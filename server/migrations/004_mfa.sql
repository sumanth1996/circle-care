-- Second sign-in step on the server (CC-200).
-- The authenticator secret is AES-256-GCM ciphertext (server/crypto.ts) and is
-- never returned after enrolment. Recovery codes are kept only as keyed
-- hashes and work once. A password sign-in for an enrolled account creates a
-- pending challenge (hashed, 5 minutes, single use) instead of a session.

ALTER TABLE users
  ADD COLUMN mfa_secret_enc          text,        -- encrypted base32 secret, set when enrolment is confirmed
  ADD COLUMN mfa_pending_secret_enc  text,        -- encrypted secret between "start" and "confirm"
  ADD COLUMN mfa_pending_at          timestamptz,
  ADD COLUMN mfa_enabled_at          timestamptz,
  ADD COLUMN totp_last_counter       bigint;      -- last accepted 30-second step: that step and older ones are refused (no replay)

CREATE TABLE mfa_recovery_codes (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,                     -- HMAC-SHA256 under DATA_HMAC_KEY; the code itself is never stored
  created_at  timestamptz NOT NULL,
  used_at     timestamptz,
  UNIQUE (user_id, code_hash)
);

CREATE TABLE mfa_challenges (
  token_hash  text PRIMARY KEY,                  -- SHA-256 of the challenge token
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL
);
CREATE INDEX mfa_challenges_user_idx ON mfa_challenges(user_id);
CREATE INDEX mfa_challenges_expires_idx ON mfa_challenges(expires_at);
