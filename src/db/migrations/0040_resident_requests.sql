-- Resident requests (deposit refund, stay extension) + action item types.

ALTER TYPE action_item_type ADD VALUE IF NOT EXISTS 'deposit_refund_request';
ALTER TYPE action_item_type ADD VALUE IF NOT EXISTS 'extension_request';

CREATE TYPE resident_request_type AS ENUM ('deposit_refund', 'stay_extension');

CREATE TYPE resident_request_status AS ENUM (
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'completed'
);

CREATE TABLE IF NOT EXISTS resident_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  type resident_request_type NOT NULL,
  status resident_request_status NOT NULL DEFAULT 'submitted',
  requested_end_date date,
  amount_paise bigint,
  notes text,
  admin_notes text,
  resolved_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resident_requests_status_type_idx
  ON resident_requests (status, type, created_at DESC);

CREATE INDEX IF NOT EXISTS resident_requests_booking_idx
  ON resident_requests (booking_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS resident_requests_open_deposit_refund_unique
  ON resident_requests (booking_id, type)
  WHERE type = 'deposit_refund' AND status IN ('submitted', 'under_review', 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS resident_requests_open_extension_unique
  ON resident_requests (booking_id, type)
  WHERE type = 'stay_extension' AND status IN ('submitted', 'under_review', 'approved');
