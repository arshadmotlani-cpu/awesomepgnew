-- Deposit refund payout requirements for vacating residents.

ALTER TABLE resident_requests
  ADD COLUMN IF NOT EXISTS meter_reading_photo_url text,
  ADD COLUMN IF NOT EXISTS use_average_billing_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_upi_id text,
  ADD COLUMN IF NOT EXISTS payout_qr_url text;
