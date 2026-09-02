-- Master Room-Change Engine: explicit self-service workflow and 72-hour holds.
-- Additive and backward-compatible; no resident-specific data changes.

ALTER TABLE room_change_requests
  ADD COLUMN IF NOT EXISTS workflow_state text,
  ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quote_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quote_hash text,
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

UPDATE room_change_requests rcr
SET
  workflow_state = CASE
    WHEN rcr.status = 'completed' THEN 'COMPLETED'
    WHEN rcr.status = 'cancelled' THEN 'CANCELLED'
    WHEN rcr.status = 'rejected' THEN 'FAILED'
    WHEN rcr.status = 'approved' THEN 'READY_TO_TRANSFER'
    WHEN EXISTS (
      SELECT 1
      FROM room_transfer_bed_holds h
      WHERE h.room_change_request_id = rcr.id AND h.status = 'active'
    ) THEN 'PAYMENT_PENDING'
    ELSE 'REQUESTED'
  END,
  held_at = coalesce(
    rcr.held_at,
    (
      SELECT h.created_at
      FROM room_transfer_bed_holds h
      WHERE h.room_change_request_id = rcr.id
      ORDER BY h.created_at
      LIMIT 1
    )
  ),
  expires_at = coalesce(
    rcr.expires_at,
    (
      SELECT h.created_at + interval '72 hours'
      FROM room_transfer_bed_holds h
      WHERE h.room_change_request_id = rcr.id
      ORDER BY h.created_at
      LIMIT 1
    )
  )
WHERE rcr.workflow_state IS NULL;

ALTER TABLE room_change_requests
  ALTER COLUMN workflow_state SET DEFAULT 'REQUESTED',
  ALTER COLUMN workflow_state SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'room_change_workflow_state_check'
  ) THEN
    ALTER TABLE room_change_requests
      ADD CONSTRAINT room_change_workflow_state_check CHECK (
        workflow_state IN (
          'REQUESTED',
          'QUOTED',
          'TARGET_HELD',
          'PAYMENT_PENDING',
          'READY_TO_TRANSFER',
          'TRANSFERRING',
          'COMPLETED',
          'CANCELLED',
          'EXPIRED',
          'FAILED'
        )
      );
  END IF;
END $$;

DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT booking_id
    FROM room_change_requests
    WHERE workflow_state NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')
    GROUP BY booking_id
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'room-change migration blocked: % bookings have multiple open requests; run the read-only audit and reconcile generically',
      duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS room_change_requests_one_open_per_booking_uidx
  ON room_change_requests (booking_id)
  WHERE workflow_state NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

CREATE INDEX IF NOT EXISTS room_change_requests_workflow_expiry_idx
  ON room_change_requests (workflow_state, expires_at);

ALTER TABLE room_transfer_bed_holds
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_reason text;

UPDATE room_transfer_bed_holds
SET expires_at = created_at + interval '72 hours'
WHERE expires_at IS NULL;

ALTER TABLE room_transfer_bed_holds
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS room_transfer_bed_holds_active_expiry_idx
  ON room_transfer_bed_holds (expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS room_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_change_request_id uuid NOT NULL REFERENCES room_change_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'held',
      'payment_required',
      'ready',
      'completed',
      'cancelled',
      'expired',
      'failed'
    )
  ),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS room_change_events_idempotency_uidx
  ON room_change_events (idempotency_key);
CREATE INDEX IF NOT EXISTS room_change_events_pending_idx
  ON room_change_events (status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS room_change_events_request_idx
  ON room_change_events (room_change_request_id, created_at);
