-- Customer email + password auth (OTP only for signup / forgot password).

ALTER TABLE customers
  ADD COLUMN password_hash text,
  ADD COLUMN must_set_password boolean NOT NULL DEFAULT false;

-- Existing OTP-only accounts must set a password on next sign-in.
UPDATE customers
SET must_set_password = true
WHERE password_hash IS NULL;
