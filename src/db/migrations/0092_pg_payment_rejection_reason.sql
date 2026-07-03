-- Booking payment proof rejection reason (rent-like re-upload flow).
ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS rejection_reason text;
