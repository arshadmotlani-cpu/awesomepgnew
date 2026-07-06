-- Explicit bed waitlist for transfer Mode 3 (occupied, no vacating notice).

CREATE TABLE IF NOT EXISTS bed_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  room_change_request_id uuid REFERENCES room_change_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS bed_waitlist_entries_active_bed_customer_uidx
  ON bed_waitlist_entries (bed_id, customer_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS bed_waitlist_entries_bed_status_idx
  ON bed_waitlist_entries (bed_id, status);
