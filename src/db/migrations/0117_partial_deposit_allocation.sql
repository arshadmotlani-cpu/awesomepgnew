-- Partial deposit collection: admin-confirmed amounts and rent received tracking.

ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS confirmed_amount_paise bigint;

ALTER TABLE payment_approval_allocations
  ADD COLUMN IF NOT EXISTS confirmed_received_paise bigint,
  ADD COLUMN IF NOT EXISTS allocation_notes text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rent_received_paise bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN pg_payment_records.confirmed_amount_paise IS
  'Admin-confirmed received amount at approval; amount_paise stays as resident submitted.';
COMMENT ON COLUMN bookings.rent_received_paise IS
  'Checkout rent collected toward first-month subtotal; synced from paid rent invoices.';
