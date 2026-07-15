-- Persist room-charges / deposit split at payment-proof approval time.
CREATE TABLE IF NOT EXISTS payment_approval_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  room_charges_paid_paise bigint NOT NULL DEFAULT 0,
  security_deposit_paid_paise bigint NOT NULL DEFAULT 0,
  prior_outstanding_paid_paise bigint NOT NULL DEFAULT 0,
  total_amount_received_paise bigint NOT NULL,
  total_expected_paise bigint NOT NULL DEFAULT 0,
  payment_category text NOT NULL,
  approved_by_admin_id uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_approval_allocations_entity_type_chk
    CHECK (entity_type IN (
      'pg_payment_record',
      'rent_invoice',
      'electricity_invoice',
      'stay_extension',
      'payment_link'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_approval_allocations_entity_uidx
  ON payment_approval_allocations (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS payment_approval_allocations_booking_idx
  ON payment_approval_allocations (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_approval_allocations_approved_at_idx
  ON payment_approval_allocations (approved_at DESC);
