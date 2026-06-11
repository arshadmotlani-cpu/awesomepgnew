CREATE TYPE admin_dues_status AS ENUM ('unknown', 'cleared', 'has_dues');

CREATE TYPE admin_deposit_refund_status AS ENUM (
  'unknown',
  'pending',
  'refunded',
  'blocked',
  'not_applicable'
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS admin_dues_status admin_dues_status NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS admin_deposit_refund_status admin_deposit_refund_status NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS admin_ops_notes text;

CREATE INDEX IF NOT EXISTS bookings_admin_dues_status_idx ON bookings (admin_dues_status);
CREATE INDEX IF NOT EXISTS bookings_admin_deposit_refund_status_idx ON bookings (admin_deposit_refund_status);
