-- Link QR payment proof submissions to a booking (checkout / pre-booking).
ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS booking_id uuid;

DO $$ BEGIN
  ALTER TABLE pg_payment_records
    ADD CONSTRAINT pg_payment_records_booking_id_fk
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pg_payment_records_pending_booking_unique
  ON pg_payment_records (booking_id)
  WHERE status = 'pending' AND booking_id IS NOT NULL;
