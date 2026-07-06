-- Bed reserve draft-first lifecycle: holds block inventory only after proof (under_review).

DO $$ BEGIN
  ALTER TYPE bed_reserve_status ADD VALUE IF NOT EXISTS 'under_review';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS bed_reserve_holds_one_active_per_bed;

CREATE UNIQUE INDEX bed_reserve_holds_one_active_per_bed
  ON bed_reserve_holds (bed_id)
  WHERE status IN ('under_review', 'active');

-- Proof-submitted legacy holds → under_review.
UPDATE bed_reserve_holds
SET status = 'under_review', updated_at = now()
WHERE status = 'pending_payment'
  AND payment_proof_url IS NOT NULL
  AND trim(payment_proof_url) <> '';

-- Unpaid legacy holds → cancelled (draft-first: no inventory lock without proof).
UPDATE bed_reserve_holds
SET status = 'cancelled', hold_expires_at = NULL, updated_at = now()
WHERE status = 'pending_payment'
  AND (payment_proof_url IS NULL OR trim(payment_proof_url) = '');

UPDATE bookings bk
SET
  status = 'cancelled',
  cancelled_at = now(),
  cancellation_reason = 'Legacy unpaid bed reserve hold migrated — please start a new reservation.',
  updated_at = now()
WHERE bk.duration_mode = 'reserve'
  AND bk.status = 'pending_payment'
  AND NOT EXISTS (
    SELECT 1 FROM bed_reserve_holds brh
    WHERE brh.booking_id = bk.id
      AND brh.status IN ('under_review', 'active')
  );
