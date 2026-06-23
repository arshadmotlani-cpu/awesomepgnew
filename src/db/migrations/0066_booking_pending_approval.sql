ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'pending_approval' AFTER 'pending_payment';
--> statement-breakpoint
-- Bookings with a pending UPI proof should be in explicit review state.
UPDATE "bookings" b
SET status = 'pending_approval', updated_at = now()
WHERE b.status = 'pending_payment'
  AND EXISTS (
    SELECT 1 FROM "pg_payment_records" pr
    WHERE pr.booking_id = b.id AND pr.status = 'pending'
  );
