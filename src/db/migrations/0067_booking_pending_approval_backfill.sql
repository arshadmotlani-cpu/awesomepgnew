-- Backfill pending UPI proofs into explicit review state (requires 0066 enum committed first).
UPDATE "bookings" b
SET status = 'pending_approval', updated_at = now()
WHERE b.status = 'pending_payment'
  AND EXISTS (
    SELECT 1 FROM "pg_payment_records" pr
    WHERE pr.booking_id = b.id AND pr.status = 'pending'
  );
