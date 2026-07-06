-- Five-state reservation lifecycle: under_review blocks inventory after proof submit.

DO $$ BEGIN
  ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'under_review';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS draft_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS bookings_draft_expires_idx
  ON bookings (draft_expires_at)
  WHERE status = 'draft';
