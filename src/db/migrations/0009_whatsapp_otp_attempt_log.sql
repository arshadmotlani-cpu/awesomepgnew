-- Phase 6 — WhatsApp OTP: audit trail for send + verify attempts.

CREATE TABLE phone_otp_attempt_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  action      TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  reason      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX phone_otp_attempt_log_phone_created_idx
  ON phone_otp_attempt_log (phone, created_at DESC);

CREATE INDEX phone_otp_attempt_log_ip_created_idx
  ON phone_otp_attempt_log (ip, created_at DESC)
  WHERE ip IS NOT NULL;
