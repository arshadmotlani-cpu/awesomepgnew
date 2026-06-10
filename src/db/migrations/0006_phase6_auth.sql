-- Phase 6 — authentication: DB-backed sessions + phone OTP challenges.

CREATE TYPE auth_session_kind AS ENUM ('customer', 'admin');

CREATE TABLE auth_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            auth_session_kind NOT NULL,
  subject_id      UUID NOT NULL,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX auth_sessions_token_hash_unique ON auth_sessions (token_hash);
CREATE INDEX auth_sessions_subject_idx ON auth_sessions (kind, subject_id);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);

CREATE TABLE phone_otp_challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX phone_otp_challenges_phone_idx ON phone_otp_challenges (phone, created_at DESC);
