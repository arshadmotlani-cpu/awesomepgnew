-- Partial deposit collection tracking on bookings.

DO $$ BEGIN
  CREATE TYPE deposit_collection_status AS ENUM (
    'pending',
    'full',
    'partial',
    'overdue',
    'waived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_collection_status deposit_collection_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS deposit_due_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_due_date date,
  ADD COLUMN IF NOT EXISTS deposit_due_approved_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_deposit_collection_status_idx
  ON bookings (deposit_collection_status)
  WHERE deposit_due_paise > 0;

-- Enum extensions + partial unique index moved to 0045 (PG requires commit before new enum use).

-- Backfill: confirmed/completed bookings with deposit fully collected in ledger
UPDATE bookings b
SET
  deposit_collection_status = 'full',
  deposit_due_paise = 0
WHERE b.status IN ('confirmed', 'completed')
  AND b.deposit_paise > 0
  AND (
    SELECT COALESCE(SUM(dl.amount_paise), 0)
    FROM deposit_ledger dl
    WHERE dl.booking_id = b.id AND dl.entry_kind = 'collected'
  ) >= b.deposit_paise;

-- Backfill: partial collection (ledger collected > 0 but < required)
UPDATE bookings b
SET
  deposit_collection_status = 'partial',
  deposit_due_paise = b.deposit_paise - (
    SELECT COALESCE(SUM(dl.amount_paise), 0)
    FROM deposit_ledger dl
    WHERE dl.booking_id = b.id AND dl.entry_kind = 'collected'
  )
WHERE b.status IN ('confirmed', 'completed')
  AND b.deposit_paise > 0
  AND b.deposit_collection_status = 'pending'
  AND (
    SELECT COALESCE(SUM(dl.amount_paise), 0)
    FROM deposit_ledger dl
    WHERE dl.booking_id = b.id AND dl.entry_kind = 'collected'
  ) > 0
  AND (
    SELECT COALESCE(SUM(dl.amount_paise), 0)
    FROM deposit_ledger dl
    WHERE dl.booking_id = b.id AND dl.entry_kind = 'collected'
  ) < b.deposit_paise;

-- Zero-deposit bookings
UPDATE bookings
SET deposit_collection_status = 'full', deposit_due_paise = 0
WHERE deposit_paise = 0 AND status IN ('confirmed', 'completed');
