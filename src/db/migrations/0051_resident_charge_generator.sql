-- Resident charge generator: adhoc rent invoices + payment link charge metadata

ALTER TABLE rent_invoices ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false;

ALTER TABLE rent_invoices DROP CONSTRAINT IF EXISTS rent_invoices_booking_month_unique;
DROP INDEX IF EXISTS rent_invoices_booking_month_unique;
CREATE UNIQUE INDEX rent_invoices_booking_month_unique
  ON rent_invoices (booking_id, billing_month)
  WHERE is_adhoc = false;

ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payment_proof_url text;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE SET NULL;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS created_by_admin_id uuid;
