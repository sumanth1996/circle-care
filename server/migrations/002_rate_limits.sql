-- Shared rate limits (CC-204). One row per bucket, shared by every server
-- instance. A bucket is "<limit name>:<sha256 of the address or account id>",
-- so raw IP addresses are never stored. Rows are counted with one atomic
-- INSERT … ON CONFLICT DO UPDATE and deleted once their window has passed.

CREATE TABLE rate_limits (
  key       text PRIMARY KEY,
  reset_at  timestamptz NOT NULL,
  count     int NOT NULL CHECK (count >= 0)
);
CREATE INDEX rate_limits_reset_idx ON rate_limits(reset_at);
