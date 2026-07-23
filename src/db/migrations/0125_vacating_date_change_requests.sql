DO $$ BEGIN
  CREATE TYPE vacating_date_change_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vacating_date_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacating_request_id uuid NOT NULL REFERENCES vacating_requests(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  current_vacating_date date NOT NULL,
  requested_vacating_date date NOT NULL,
  status vacating_date_change_status NOT NULL DEFAULT 'pending',
  current_estimated_refund_paise bigint NOT NULL DEFAULT 0,
  requested_estimated_refund_paise bigint NOT NULL DEFAULT 0,
  refund_delta_paise bigint NOT NULL DEFAULT 0,
  preview_snapshot jsonb,
  resident_notes text,
  admin_notes text,
  reviewed_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vacating_date_change_one_pending_per_vacating
  ON vacating_date_change_requests (vacating_request_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS vacating_date_change_booking_idx
  ON vacating_date_change_requests (booking_id, status);

CREATE INDEX IF NOT EXISTS vacating_date_change_status_idx
  ON vacating_date_change_requests (status, updated_at);
