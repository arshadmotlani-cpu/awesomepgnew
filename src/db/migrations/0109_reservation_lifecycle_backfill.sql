-- Backfill legacy checkout holds into under_review or cancel orphan holds.

-- Pending approval with proof → under_review (blocks inventory correctly).
UPDATE bed_reservations br
SET status = 'under_review', updated_at = now()
FROM bookings bk
INNER JOIN pg_payment_records ppr ON ppr.booking_id = bk.id
WHERE br.booking_id = bk.id
  AND br.status = 'hold'
  AND br.kind = 'primary'
  AND bk.status = 'pending_approval'
  AND ppr.status = 'pending'
  AND ppr.payment_screenshot_url IS NOT NULL
  AND trim(ppr.payment_screenshot_url) <> '';

-- Unpaid pending_payment holds without proof → cancel (no inventory block).
UPDATE bed_reservations br
SET status = 'cancelled', hold_expires_at = NULL, updated_at = now()
FROM bookings bk
WHERE br.booking_id = bk.id
  AND br.status = 'hold'
  AND br.kind = 'primary'
  AND bk.status IN ('pending_payment', 'draft');

UPDATE bookings
SET status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = 'Legacy unpaid hold migrated — please submit a new reservation request.',
    updated_at = now()
WHERE status = 'pending_payment'
  AND id NOT IN (
    SELECT DISTINCT booking_id FROM bed_reservations WHERE status IN ('under_review', 'active')
  );
