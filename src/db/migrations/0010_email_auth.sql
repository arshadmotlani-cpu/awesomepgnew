-- Phase 6.2 — Email verification auth (replaces WhatsApp OTP delivery).

CREATE TABLE email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email citext NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX email_otp_challenges_email_idx ON email_otp_challenges (email, created_at DESC);

CREATE TABLE email_otp_attempt_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email citext NOT NULL,
  action text NOT NULL,
  success boolean NOT NULL,
  reason text,
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX email_otp_attempt_log_email_created_idx ON email_otp_attempt_log (email, created_at DESC);
CREATE INDEX email_otp_attempt_log_ip_created_idx ON email_otp_attempt_log (ip, created_at DESC);

ALTER TABLE customers ALTER COLUMN auth_provider SET DEFAULT 'email';
