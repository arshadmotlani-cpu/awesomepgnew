-- Admin password recovery tokens + long-lived session support.

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS remember_me BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_password_reset_tokens_hash_idx
  ON admin_password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS admin_password_reset_tokens_admin_created_idx
  ON admin_password_reset_tokens (admin_id, created_at DESC);
