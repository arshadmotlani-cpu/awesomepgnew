-- Only pending/approved vacating rows block a new request per booking.
-- Rejected and completed rows are historical and must allow resubmit.

ALTER TABLE vacating_requests DROP CONSTRAINT IF EXISTS vacating_requests_one_open_per_booking;

DROP INDEX IF EXISTS vacating_requests_one_open_per_booking;

CREATE UNIQUE INDEX vacating_requests_one_active_per_booking
  ON vacating_requests (booking_id)
  WHERE status IN ('pending', 'approved');
