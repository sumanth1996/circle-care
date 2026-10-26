-- Circle Care schema v1 (CC-189).
-- Each persona has its own table. Sensitive values are never stored in full:
-- SSNs are AES-256-GCM ciphertext + last four; bank accounts and cards are
-- vault tokens + last four. CHECK constraints make it impossible to store a
-- full account or card number in the last-four columns.

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash    text NOT NULL,
  role             text NOT NULL CHECK (role IN ('elder', 'caregiver', 'guardian')),
  failed_attempts  int  NOT NULL DEFAULT 0,
  first_failed_at  timestamptz,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,               -- SHA-256 of the cookie token; the token itself is never stored
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL              -- absolute expiry (12 hours)
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE elders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  phone       text NOT NULL CHECK (phone ~ '^\+1[0-9]{10}$'),
  email       text NOT NULL,
  ssn_enc     text,
  ssn_last4   char(4) CHECK (ssn_last4 ~ '^[0-9]{4}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE caregivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  phone       text NOT NULL CHECK (phone ~ '^\+1[0-9]{10}$'),
  email       text NOT NULL,
  ssn_enc     text,
  ssn_last4   char(4) CHECK (ssn_last4 ~ '^[0-9]{4}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guardians (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  phone       text NOT NULL CHECK (phone ~ '^\+1[0-9]{10}$'),
  email       text NOT NULL,
  ssn_enc     text,
  ssn_last4   char(4) CHECK (ssn_last4 ~ '^[0-9]{4}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One SSN per person across all three persona tables. HMAC-SHA256 with a
-- separate key, so duplicates are found without decrypting anything.
CREATE TABLE ssn_fingerprints (
  fingerprint text PRIMARY KEY,
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE photos (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data_enc      text NOT NULL,                  -- encrypted image bytes
  size_bytes    int  NOT NULL CHECK (size_bytes <= 2097152),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Simulated payment vault (stands in for Stripe in lower environments).
-- Holds only what Stripe would give back: never the full number or CVC.
CREATE TABLE vault_tokens (
  token          text PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('bank_account', 'card')),
  owner_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metadata       jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  attached_at    timestamptz,
  revoked_at     timestamptz
);

CREATE TABLE bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vault_token    text NOT NULL UNIQUE,
  bank_name      text NOT NULL,
  holder_name    text NOT NULL,
  account_type   text NOT NULL CHECK (account_type IN ('checking', 'savings')),
  account_last4  char(4) NOT NULL CHECK (account_last4 ~ '^[0-9]{4}$'),
  routing_last4  char(4) NOT NULL CHECK (routing_last4 ~ '^[0-9]{4}$'),
  ach_fee_cents  int  NOT NULL DEFAULT 0 CHECK (ach_fee_cents = 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bank_accounts_one_per_user ON bank_accounts(user_id);

CREATE TABLE payment_cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vault_token  text NOT NULL UNIQUE,
  holder_name  text NOT NULL,
  brand        text NOT NULL,
  funding      text NOT NULL CHECK (funding IN ('credit', 'debit', 'prepaid', 'unknown')),
  last4        char(4) NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  exp_month    int  NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year     int  NOT NULL CHECK (exp_year BETWEEN 2000 AND 2100),
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_cards_user_idx ON payment_cards(user_id);
CREATE UNIQUE INDEX payment_cards_one_primary ON payment_cards(user_id) WHERE is_primary;

-- Append-only audit trail (CC-185). Details are masked before they are written.
CREATE TABLE audit_events (
  id               bigserial PRIMARY KEY,
  at               timestamptz NOT NULL DEFAULT now(),
  actor_user_id    uuid,
  subject_user_id  uuid,
  action           text NOT NULL,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_subject_idx ON audit_events(subject_user_id, at DESC);

CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_change
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

-- Masked views for FDIC / legal audits (CC-184). An auditor's read-only
-- database role should be granted these views only, never the base tables.
CREATE VIEW audit_people_masked AS
  SELECT u.id AS user_id,
         u.role,
         p.first_name || ' ' || left(p.last_name, 1) || '.'      AS name_masked,
         regexp_replace(p.email, '^(.)[^@]*', '\1•••')            AS email_masked,
         '(•••) •••-' || right(p.phone, 4)                        AS phone_masked,
         CASE WHEN p.ssn_last4 IS NULL THEN NULL ELSE '•••-••-' || p.ssn_last4 END AS ssn_masked,
         u.created_at
    FROM users u
    JOIN (
      SELECT user_id, first_name, last_name, email, phone, ssn_last4 FROM elders
      UNION ALL
      SELECT user_id, first_name, last_name, email, phone, ssn_last4 FROM caregivers
      UNION ALL
      SELECT user_id, first_name, last_name, email, phone, ssn_last4 FROM guardians
    ) p ON p.user_id = u.id;

CREATE VIEW audit_payment_methods_masked AS
  SELECT user_id, 'bank_account' AS kind, bank_name AS label, account_type AS detail,
         '••••' || account_last4 AS number_masked, '•••••' || routing_last4 AS routing_masked,
         NULL::boolean AS is_primary, ach_fee_cents AS fee_cents, created_at
    FROM bank_accounts
  UNION ALL
  SELECT user_id, 'card', brand, funding,
         '•••• ' || last4, NULL, is_primary, NULL::int, created_at
    FROM payment_cards;
