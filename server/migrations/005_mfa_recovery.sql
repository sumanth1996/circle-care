-- Getting back in after losing the authenticator and every recovery code (CC-235).
-- A reset needs the password (a sign-in challenge), then a link emailed to the
-- account (30 minutes, single use), then a waiting period (72 hours) that the
-- owner can cancel from the "wait started" email or any signed-in device.
-- Links are stored only as SHA-256 hashes. Changing or resetting the password
-- cancels a waiting reset.

CREATE TABLE mfa_recovery_requests (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirm_hash        text NOT NULL UNIQUE,      -- SHA-256 of the emailed confirm token
  cancel_hash         text UNIQUE,               -- SHA-256 of the emailed cancel token, set when the wait starts
  created_at          timestamptz NOT NULL,
  confirm_expires_at  timestamptz NOT NULL,
  confirmed_at        timestamptz,               -- the emailed link was used: the wait has started
  ready_at            timestamptz,               -- the wait ends; the reset can be finished from then on
  cancelled_at        timestamptz,
  completed_at        timestamptz
);
CREATE INDEX mfa_recovery_user_idx ON mfa_recovery_requests(user_id);
