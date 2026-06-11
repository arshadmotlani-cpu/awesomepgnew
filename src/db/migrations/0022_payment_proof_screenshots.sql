-- Tenant UPI payment screenshots for admin review (rent invoices + extensions).
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS payment_proof_url text;

ALTER TABLE stay_extensions
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_proof_transaction_ref text;
