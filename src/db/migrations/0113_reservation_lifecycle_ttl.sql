-- Reservation review reminder tracking (24h nudge before auto-expiry).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reservation_review_reminder_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_reservation_review_reminder_idx
  ON bookings (reservation_review_reminder_at)
  WHERE status = 'pending_approval';
