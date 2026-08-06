-- Resident Exit Brain — deterministic move-out mode after vacating approval.
CREATE TABLE IF NOT EXISTS resident_exit_brain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  vacating_request_id uuid NOT NULL REFERENCES vacating_requests(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  activated_at timestamptz NOT NULL DEFAULT now(),
  notice_given_date date NOT NULL,
  expected_checkout_date date NOT NULL,
  frozen_notice_penalty_paise bigint NOT NULL DEFAULT 0,
  frozen_rent_late_fee_paise bigint NOT NULL DEFAULT 0,
  frozen_rent_late_fees_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resident_exit_brain_booking_active_unique
  ON resident_exit_brain (booking_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS resident_exit_brain_room_idx ON resident_exit_brain (room_id);
CREATE INDEX IF NOT EXISTS resident_exit_brain_customer_idx ON resident_exit_brain (customer_id);
