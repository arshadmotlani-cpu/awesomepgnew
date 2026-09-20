-- Structured vendor bank fields for Vendor Master (payment details SSOT).
ALTER TABLE fyh_vendors
  ADD COLUMN IF NOT EXISTS bank_account_holder_name text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_ifsc text;
