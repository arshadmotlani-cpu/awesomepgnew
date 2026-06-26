-- Continuous residency: one logical stay spanning multiple bookings.

CREATE TYPE residency_lifecycle AS ENUM (
  'onboarding',
  'active',
  'vacating',
  'checkout',
  'ended',
  'cancelled'
);

CREATE TABLE resident_residencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE RESTRICT,
  lifecycle residency_lifecycle NOT NULL DEFAULT 'active',
  started_at date NOT NULL,
  expected_move_out date,
  ended_at date,
  current_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  current_bed_id uuid REFERENCES beds(id) ON DELETE SET NULL,
  deposit_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX resident_residencies_one_open_per_customer
  ON resident_residencies (customer_id)
  WHERE lifecycle IN ('onboarding', 'active', 'vacating', 'checkout');

CREATE INDEX resident_residencies_customer_idx ON resident_residencies (customer_id);
CREATE INDEX resident_residencies_pg_idx ON resident_residencies (pg_id, lifecycle);
CREATE INDEX resident_residencies_current_booking_idx ON resident_residencies (current_booking_id);

CREATE TABLE residency_booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  residency_id uuid NOT NULL REFERENCES resident_residencies(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  sequence_no int NOT NULL DEFAULT 1,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (residency_id, booking_id),
  UNIQUE (booking_id)
);

CREATE INDEX residency_booking_links_residency_idx ON residency_booking_links (residency_id, sequence_no);
