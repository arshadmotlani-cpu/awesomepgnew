-- Historical and checkout-recovery electricity contributions per room billing month.
-- Reduces splittable pool before monthly invoice distribution.

CREATE TABLE IF NOT EXISTS electricity_room_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  kind text NOT NULL CHECK (kind IN ('historical', 'checkout_recovery')),
  reason text,
  contribution_date date NOT NULL,
  checkout_settlement_id uuid REFERENCES checkout_settlements(id) ON DELETE RESTRICT,
  created_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS electricity_room_contributions_checkout_unique
  ON electricity_room_contributions(checkout_settlement_id)
  WHERE checkout_settlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS electricity_room_contributions_room_month_idx
  ON electricity_room_contributions(room_id, billing_month);

CREATE INDEX IF NOT EXISTS electricity_room_contributions_booking_idx
  ON electricity_room_contributions(booking_id);
