-- Resident billing profile (invoice template) — one row per active booking.
CREATE TABLE IF NOT EXISTS resident_billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  rent_amount_paise bigint NOT NULL,
  billing_day smallint NOT NULL DEFAULT 5 CHECK (billing_day BETWEEN 1 AND 28),
  default_payment_method text NOT NULL DEFAULT 'upi',
  auto_generate boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_billing_profiles_booking_unique UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS resident_billing_profiles_pg_idx
  ON resident_billing_profiles (pg_id);

CREATE INDEX IF NOT EXISTS resident_billing_profiles_customer_idx
  ON resident_billing_profiles (customer_id);
